const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const multer = require("multer");
const fs = require("fs");
const session = require("express-session");
const { uploadBufferToCloud, cloudHealth } = require('./storage');

const app = express();
const PORT = 5000;

// Quick diagnostic for Drive envs (length only, not contents)
console.log(`[CloudEnv] provider=${(process.env.STORAGE_PROVIDER || 'mega')} mega_email=${process.env.MEGA_EMAIL ? 'set' : 'missing'}`);

// Global error logging for diagnosis
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Setup session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'beatbuzz_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection error:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL database");

  // 🔥 HUNT DOWN AND DESTROY THE SELF-LIKE BLOCKER TRIGGER
  db.query(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_TABLE = 'post_likes' AND ACTION_STATEMENT LIKE '%You cannot like your own post%'`, (err, results) => {
    if (results && results.length > 0) {
      results.forEach(row => {
        db.query(`DROP TRIGGER IF EXISTS ${row.TRIGGER_NAME}`, (dropErr) => {
          if (!dropErr) console.log(`✅ Successfully removed pesky trigger: ${row.TRIGGER_NAME}`);
        });
      });
    }
  });

  // 🔥 NEW: Auto-create Stories tables if they don't exist
  db.query(`CREATE TABLE IF NOT EXISTS stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    image_url VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.query(`CREATE TABLE IF NOT EXISTS story_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    story_id INT NOT NULL,
    viewer_username VARCHAR(255) NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_view (story_id, viewer_username)
  )`);

// 🔥 NEW: Add 'is_liked' column to the existing table safely
  db.query(`ALTER TABLE story_views ADD COLUMN is_liked BOOLEAN DEFAULT FALSE`, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') console.error('Error adding is_liked:', err);
  });

  // 🔥 NEW: Add 'caption' column to the stories table safely
  db.query(`ALTER TABLE stories ADD COLUMN caption VARCHAR(1000) DEFAULT NULL`, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') console.error('Error adding caption:', err);
  });


  // Ensure cloud storage columns exist (profiles.profile_pic_url, posts.image_url)
  ensureCloudColumns().catch((e) => {
    console.warn('Cloud column check failed (non-fatal):', e && e.message ? e.message : e);
  });

  // Align schema for cloud storage: allow posts.image_filename NULL and modern trigger
  ensureCloudSchema().catch((e) => {
    console.warn('Cloud schema alignment failed (non-fatal):', e && e.message ? e.message : e);
  });

  // Ensure reset token columns exist on credentials
  ensureResetColumns().catch((e) => {
    console.warn('Reset column check failed (non-fatal):', e && e.message ? e.message : e);
  });
});

// Helper: ensure DB has required columns for Drive URLs
async function ensureCloudColumns() {
  await new Promise((resolve, reject) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'profiles' AND column_name = 'profile_pic_url'`,
      (err, rows) => {
        if (err) return reject(err);
        const exists = rows && rows[0] && rows[0].cnt > 0;
        if (exists) return resolve();
        db.query(`ALTER TABLE profiles ADD COLUMN profile_pic_url VARCHAR(512) DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });

  await new Promise((resolve, reject) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'image_url'`,
      (err, rows) => {
        if (err) return reject(err);
        const exists = rows && rows[0] && rows[0].cnt > 0;
        if (exists) return resolve();
        db.query(`ALTER TABLE posts ADD COLUMN image_url VARCHAR(512) DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });
  await new Promise((resolve, reject) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'profiles' AND column_name = 'cover_pic_url'`,
      (err, rows) => {
        if (err) return reject(err);
        const exists = rows && rows[0] && rows[0].cnt > 0;
        if (exists) return resolve();
        db.query(`ALTER TABLE profiles ADD COLUMN cover_pic_url VARCHAR(512) DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });
}

// Helper: align schema to support image_url-only posts and sane local path checks
async function ensureCloudSchema() {
  // Make posts.image_filename nullable to allow image_url-only inserts
  await new Promise((resolve, reject) => {
    db.query(
      `SELECT IS_NULLABLE AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'image_filename'`,
      (err, rows) => {
        if (err) return reject(err);
        const nullable = rows && rows[0] && rows[0].nullable === 'YES';
        if (nullable) return resolve();
        db.query(`ALTER TABLE posts MODIFY COLUMN image_filename VARCHAR(255) DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });

  // Ensure modern posts_bi trigger that permits either image_filename or image_url
  await new Promise((resolve, reject) => {
    db.query(`DROP TRIGGER IF EXISTS posts_bi`, (err) => {
      if (err) return reject(err);
      const triggerSql = `CREATE TRIGGER posts_bi BEFORE INSERT ON posts\n` +
        `FOR EACH ROW\n` +
        `BEGIN\n` +
        `  SET NEW.caption = NULLIF(LEFT(TRIM(IFNULL(NEW.caption, '')), 1000), '');\n` +
        `  IF (NEW.image_filename IS NULL OR TRIM(NEW.image_filename) = '') AND (NEW.image_url IS NULL OR TRIM(NEW.image_url) = '') AND (NEW.caption IS NULL OR TRIM(NEW.caption) = '') THEN\n` +
`    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Either an image or text is required';\n` +
        `  END IF;\n` +
        `  IF NEW.image_filename IS NOT NULL AND TRIM(NEW.image_filename) <> '' THEN\n` +
        `    IF NEW.image_filename NOT REGEXP '^/uploads/posts/' THEN\n` +
        `      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Local image must be under /uploads/posts/ path';\n` +
        `    END IF;\n` +
        `    IF NEW.image_filename NOT REGEXP '\\.(jpg|jpeg|png|gif)$' THEN\n` +
        `      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unsupported image type';\n` +
        `    END IF;\n` +
        `  END IF;\n` +
        `END`;
      db.query(triggerSql, (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

// Helper: ensure DB has required columns for password resets
async function ensureResetColumns() {
  await new Promise((resolve, reject) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'credentials' AND column_name = 'reset_token'`,
      (err, rows) => {
        if (err) return reject(err);
        const exists = rows && rows[0] && rows[0].cnt > 0;
        if (exists) return resolve();
        db.query(`ALTER TABLE credentials ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });
  await new Promise((resolve, reject) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'credentials' AND column_name = 'reset_expiry'`,
      (err, rows) => {
        if (err) return reject(err);
        const exists = rows && rows[0] && rows[0].cnt > 0;
        if (exists) return resolve();
        db.query(`ALTER TABLE credentials ADD COLUMN reset_expiry DATETIME DEFAULT NULL`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      }
    );
  });
}

// Nodemailer setup (prefer env vars; sanitize app password formatting)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
  user: process.env.GMAIL_USER,
  pass: process.env.GMAIL_PASS
}
});

// Simple in-memory resend limiter: 60s cooldown, max 3 resends per 15 minutes
const otpResendLimiter = new Map(); // key: identifier (email or username)
function canResend(key) {
  const now = Date.now();
  const rec = otpResendLimiter.get(key);
  const COOLDOWN_MS = 60 * 1000;
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 3;
  if (!rec) return { allowed: true, cooldownRemaining: 0 };
  if (now - rec.lastSent < COOLDOWN_MS) {
    return { allowed: false, cooldownRemaining: Math.ceil((COOLDOWN_MS - (now - rec.lastSent)) / 1000) };
  }
  if (now - rec.windowStart > WINDOW_MS) {
    return { allowed: true, cooldownRemaining: 0 };
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return { allowed: false, cooldownRemaining: Math.ceil((WINDOW_MS - (now - rec.windowStart)) / 1000) };
  }
  return { allowed: true, cooldownRemaining: 0 };
}
function recordResend(key) {
  const now = Date.now();
  const WINDOW_MS = 15 * 60 * 1000;
  const rec = otpResendLimiter.get(key);
  if (!rec || (now - rec.windowStart > WINDOW_MS)) {
    otpResendLimiter.set(key, { lastSent: now, windowStart: now, count: 1 });
  } else {
    rec.lastSent = now; rec.count += 1; otpResendLimiter.set(key, rec);
  }
}

// Multer setup for file uploads (use memory storage to forward to Drive)
const upload = multer({ storage: multer.memoryStorage() });
const postUpload = multer({ storage: multer.memoryStorage() });

// Routes

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public/register.html"));
});

// Cloud health check: verifies credentials and optional folder access
app.get('/api/cloud_health', async (req, res) => {
  try {
    const result = await cloudHealth();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Registration route
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  // if (!email.endsWith("@vit.edu")) {
  //   return res.send("❌ Only VIT emails are allowed");
  // }

  db.query(
    "SELECT * FROM credentials WHERE username = ? OR email = ?",
    [username, email],
    async (err, results) => {
      if (err) throw err;
      if (results.length > 0) {
        return res.status(400).json({ ok: false, message: "❌ Username or Email already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      // Generate a 6-digit numeric OTP and set 5 minutes expiry
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: "BeatBuzz Email Verification OTP",
        html: `
          <p>Hi ${username},</p>
          <p>Your email verification OTP is: <strong>${otp}</strong></p>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
          <p>Enter it on the verification page to activate your account.</p>
        `
      };

      // Insert credentials first, storing the OTP in confirm_token and expiry in token_expiry
      db.query(
        "INSERT INTO credentials (username, email, password, confirm_token, token_expiry, is_active) VALUES (?, ?, ?, ?, ?, 0)",
        [username, email, hashedPassword, otp, expiry],
        (err, insertResult) => {
          if (err) {
            console.error("Registration insert error:", err);
            return res.status(500).send("❌ Server error while registering. Please try again.");
          }

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error("Email send error:", error);
              return res.json({ ok: true, mail_error: true, message: "✅ Registration successful, but email delivery failed. Please try again later.", username, email });
            }
            res.json({ ok: true, mail_error: false, message: "✅ Registration successful! OTP sent to your email.", username, email });
          });
        }
      );
    }
  );
});

// Deprecated link-based confirmation; guide users to OTP verification
app.get("/confirm/:token", (req, res) => {
  res.status(410).send("🔁 Email verification now uses OTP. Please open /verify and enter the OTP sent to your email.");
});

// Serve OTP verification page
app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, "public/verify.html"));
});

// OTP verification API
app.post('/api/verify_otp', (req, res) => {
  const { username, email, otp } = req.body;
  if (!otp || (!username && !email)) {
    return res.status(400).json({ ok: false, message: 'Provide username or email and OTP.' });
  }

  const identifierSql = username ? "username = ?" : "email = ?";
  const identifierVal = username ? username : email;

  db.query(
    `SELECT * FROM credentials WHERE ${identifierSql} AND confirm_token = ? AND token_expiry > NOW() AND is_active = 0`,
    [identifierVal, otp],
    (err, results) => {
      if (err) {
        console.error('OTP verify query error:', err);
        return res.status(500).json({ ok: false, message: 'Server error. Try again.' });
      }
      if (!results || results.length === 0) {
        return res.status(400).json({ ok: false, message: 'Invalid OTP or expired. Request registration again.' });
      }

      const user = results[0];
      db.query(
        "UPDATE credentials SET is_active = 1, confirm_token = NULL, token_expiry = NULL WHERE username = ?",
        [user.username],
        (err2) => {
          if (err2) {
            console.error('OTP verify update error:', err2);
            return res.status(500).json({ ok: false, message: 'Server error. Try again.' });
          }
          req.session.username = user.username;
          return res.json({ ok: true, message: 'Email verified successfully!', redirect: `/setup/setup.html?email=${encodeURIComponent(user.email)}` });
        }
      );
    }
  );
});

// Resend OTP (rate limited)
app.post('/api/resend_otp', (req, res) => {
  const { username, email } = req.body;
  if (!username && !email) {
    return res.status(400).json({ ok: false, message: 'Provide username or email.' });
  }
  const identifierSql = username ? "username = ?" : "email = ?";
  const identifierVal = username ? username : email;

  const limiterKey = identifierVal.toLowerCase();
  const check = canResend(limiterKey);
  if (!check.allowed) {
    return res.status(429).json({ ok: false, message: `Please wait ${check.cooldownRemaining}s before resending OTP.`, cooldown: check.cooldownRemaining });
  }

  db.query(
    `SELECT * FROM credentials WHERE ${identifierSql} AND is_active = 0`,
    [identifierVal],
    async (err, results) => {
      if (err) {
        console.error('Resend OTP query error:', err);
        return res.status(500).json({ ok: false, message: 'Server error. Try again.' });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ ok: false, message: 'Account not found or already active.' });
      }
      const user = results[0];
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 5 * 60 * 1000);
      const mailOptions = {
        from: process.env.GMAIL_USER || "rajpurohitpiyush2006@gmail.com",
        to: user.email,
        subject: "BeatBuzz Email Verification OTP (Resent)",
        html: `
          <p>Hi ${user.username || ''},</p>
          <p>Your new email verification OTP is: <strong>${otp}</strong></p>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
        `
      };

      db.query(
        "UPDATE credentials SET confirm_token = ?, token_expiry = ? WHERE username = ?",
        [otp, expiry, user.username],
        (err2) => {
          if (err2) {
            console.error('Resend OTP update error:', err2);
            return res.status(500).json({ ok: false, message: 'Server error. Try again.' });
          }
          transporter.sendMail(mailOptions, (error) => {
            if (error) {
              console.error('Resend OTP mail error:', error);
              return res.status(502).json({ ok: false, message: 'Email delivery failed. Try later.' });
            }
            recordResend(limiterKey);
            return res.json({ ok: true, message: 'OTP resent. Check your email.', cooldown: 60 });
          });
        }
      );
    }
  );
});

// Login route - stores username in session
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query("SELECT * FROM credentials WHERE username = ?", [username], async (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send("❌ User not found. <a href='/register'>Register here</a>");

    const user = results[0];

    if (!user.is_active) return res.send("❌ Please verify your email first");

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.username = username;  // store username in session
      res.redirect('/explore/explore.html');
    } else {
      res.send("❌ Incorrect password");
    }
  });
});

// Forgot password: generate reset token and send email
app.post('/api/forgot_password', (req, res) => {
  const { email, username } = req.body;
  const identifier = (email && email.trim()) || (username && username.trim());
  if (!identifier) return res.status(400).send('❌ Email or username is required');

  const findSql = email ? 'SELECT * FROM credentials WHERE email = ?' : 'SELECT * FROM credentials WHERE username = ?';
  db.query(findSql, [identifier], (err, rows) => {
    if (err) return res.status(500).send('❌ Server error');
    if (rows.length === 0) {
      // Do not reveal whether user exists
      return res.status(200).send('✅ If the account exists, a reset link has been sent');
    }
    const user = rows[0];
    const token = crypto.randomBytes(20).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    db.query('UPDATE credentials SET reset_token = ?, reset_expiry = ? WHERE username = ?', [token, expiry, user.username], (uerr) => {
      if (uerr) return res.status(500).send('❌ Failed to set reset token');
      const resetLink = `http://localhost:${PORT}/reset/${token}`;
      const mailOptions = {
        from: process.env.GMAIL_USER || "rajpurohitpiyush2006@gmail.com",
        to: user.email,
        subject: 'Reset your Beatbuzz password',
        html: `<p>Hi ${user.username}, click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
      };
      transporter.sendMail(mailOptions, (merr) => {
        if (merr) {
          console.error('Reset email error:', merr);
          // Still allow manual use: return link inline
          return res.status(200).send(`✅ Reset link (email failed): <a href="${resetLink}">${resetLink}</a>`);
        }
        res.status(200).send('✅ If the account exists, a reset link has been sent');
      });
    });
  });
});

// Serve reset page after validating token is not expired
app.get('/reset/:token', (req, res) => {
  const { token } = req.params;
  db.query('SELECT username FROM credentials WHERE reset_token = ? AND reset_expiry > NOW()', [token], (err, rows) => {
    if (err) return res.status(500).send('❌ Server error');
    if (rows.length === 0) return res.status(400).send('❌ Invalid or expired reset link');
    res.sendFile(path.join(__dirname, 'public', 'reset.html'));
  });
});

// Reset password using token
app.post('/api/reset_password', async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).send('❌ Missing token or password');
  try {
    const hashed = await bcrypt.hash(new_password, 10);
    db.query('SELECT username FROM credentials WHERE reset_token = ? AND reset_expiry > NOW()', [token], (err, rows) => {
      if (err) return res.status(500).send('❌ Server error');
      if (rows.length === 0) return res.status(400).send('❌ Invalid or expired reset token');
      const username = rows[0].username;
      db.query('UPDATE credentials SET password = ?, reset_token = NULL, reset_expiry = NULL WHERE username = ?', [hashed, username], (uerr) => {
        if (uerr) return res.status(500).send('❌ Failed to update password');
        res.status(200).send('✅ Password updated');
      });
    });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).send('❌ Server error');
  }
});

// Forgot password via OTP: request a 6-digit code
app.post('/api/forgot_password_otp_request', (req, res) => {
  const { email, username } = req.body;
  const identifier = (email && email.trim()) || (username && username.trim());
  if (!identifier) return res.status(400).json({ ok: false, message: 'Email or username is required' });

  const findSql = email ? 'SELECT * FROM credentials WHERE email = ?' : 'SELECT * FROM credentials WHERE username = ?';
  db.query(findSql, [identifier], (err, rows) => {
    if (err) {
      console.error('OTP forgot find error:', err);
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
    if (!rows || rows.length === 0) {
      // do not reveal user existence
      return res.json({ ok: true, message: 'If the account exists, an OTP has been sent' });
    }
    const user = rows[0];

    const limiterKey = (user.email || user.username).toLowerCase();
    const check = canResend(limiterKey);
    if (!check.allowed) {
      return res.status(429).json({ ok: false, message: `Please wait ${check.cooldownRemaining}s before requesting another OTP.`, cooldown: check.cooldownRemaining });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    db.query('UPDATE credentials SET reset_token = ?, reset_expiry = ? WHERE username = ?', [otp, expiry, user.username], (uerr) => {
      if (uerr) {
        console.error('OTP forgot set error:', uerr);
        return res.status(500).json({ ok: false, message: 'Failed to create OTP' });
      }
      const mailOptions = {
        from: process.env.GMAIL_USER || 'rajpurohitpiyush2006@gmail.com',
        to: user.email,
        subject: 'Beatbuzz Password Reset OTP',
        html: `<p>Hi ${user.username},</p><p>Your password reset OTP is: <strong>${otp}</strong></p><p>This OTP is valid for <strong>5 minutes</strong>.</p>`
      };
      transporter.sendMail(mailOptions, (merr) => {
        if (merr) {
          console.error('OTP forgot mail error:', merr);
          // Still respond success to avoid enumeration
          return res.json({ ok: true, mail_error: true, message: 'If the account exists, an OTP has been sent' });
        }
        recordResend(limiterKey);
        return res.json({ ok: true, mail_error: false, message: 'OTP sent to your email', cooldown: 60 });
      });
    });
  });
});

// Forgot password via OTP: verify and set new password
app.post('/api/forgot_password_otp_verify', async (req, res) => {
  const { email, username, otp, new_password } = req.body;
  if ((!email && !username) || !otp || !new_password) {
    return res.status(400).json({ ok: false, message: 'Provide email or username, OTP, and new password' });
  }
  try {
    const hashed = await bcrypt.hash(new_password, 10);
    const identifierSql = email ? 'email = ?' : 'username = ?';
    const identifierVal = email ? email.trim() : username.trim();
    db.query(`SELECT username FROM credentials WHERE ${identifierSql} AND reset_token = ? AND reset_expiry > NOW()`, [identifierVal, otp], (err, rows) => {
      if (err) {
        console.error('OTP verify query error:', err);
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
      if (!rows || rows.length === 0) {
        return res.status(400).json({ ok: false, message: 'Invalid or expired OTP' });
      }
      const u = rows[0].username;
      db.query('UPDATE credentials SET password = ?, reset_token = NULL, reset_expiry = NULL WHERE username = ?', [hashed, u], (uerr) => {
        if (uerr) {
          console.error('OTP password update error:', uerr);
          return res.status(500).json({ ok: false, message: 'Failed to update password' });
        }
        return res.json({ ok: true, message: 'Password updated' });
      });
    });
  } catch (e) {
    console.error('OTP forgot verify error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});
// Logout route - destroy session and redirect to login page
app.get('/logout', (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      // Clear session cookie (default name from express-session)
      res.clearCookie('connect.sid');
      // Redirect to login page
      res.redirect('/index.html');
    });
  } catch (e) {
    console.error('Logout unexpected error:', e);
    res.redirect('/index.html');
  }
});

// Lightweight session user endpoint for frontend bootstrapping
app.get('/api/session_user', (req, res) => {
  const username = req.session && req.session.username ? req.session.username : null;
  res.json({ username });
});

// Profile Setup route with multer for file upload
app.post('/submit_profile', upload.single('profile_pic'), async (req, res) => {
  if (!req.session.username) {
  return res.status(401).send("Not logged in");
}
  const { email, full_name, branch, clubs_part_of, domain, position, year, hometown, bio, zodiac_sign } = req.body;
  let profile_pic_url = null;

  if (req.file && req.file.buffer) {
    try {
      const filename = `profile-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
      const uploaded = await uploadBufferToCloud({
        buffer: req.file.buffer,
        filename,
        mimeType: req.file.mimetype,
        category: 'profiles'
      });
      profile_pic_url = uploaded.url;
    } catch (e) {
      console.error('Drive upload (profile setup) error:', e);
      return res.status(500).send('Failed to upload profile picture to cloud');
    }
  }

  if (!email || !full_name || !branch || !year || !hometown || !bio || !zodiac_sign) {
    return res.status(400).send('❌ Please fill all required fields');
  }

  db.query("SELECT * FROM credentials WHERE email = ? AND is_active = 1", [email], (err, results) => {
    if (err) {
      console.error('DB check error:', err);
      return res.status(500).send('Database check error');
    }

    if (results.length === 0) {
      return res.status(403).send('❌ Email not verified. Please verify your account first.');
    }

    const sql = `INSERT INTO profiles (
  username, email, full_name, branch, clubs_part_of, domain,
  position, year, hometown, bio, zodiac_sign,
  profile_pic, profile_pic_url
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [req.session.username, email, full_name, branch, clubs_part_of || '', domain || '', position || '', parseInt(year), hometown, bio, zodiac_sign, null, profile_pic_url];

    db.query(sql, values, (err) => {
      if (err) {
        console.error('DB insert error:', err);
        return res.status(500).send('Database insertion error');
      }
      res.redirect('/explore/explore.html');
    });
  });
});

// Fetch full profile for logged-in user
app.get('/api/my_profile', (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  const sql = `
    SELECT c.username AS username, p.email, p.full_name, p.branch, p.clubs_part_of, p.domain,
           p.position, p.year, p.hometown, p.bio, p.zodiac_sign, p.profile_pic, p.profile_pic_url, p.cover_pic_url
    FROM credentials c
    LEFT JOIN profiles p ON p.email = c.email
    WHERE c.username = ?
    LIMIT 1
  `;

  db.execute(sql, [username], (err, rows) => {
    if (err) {
      console.error('My profile fetch error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  });
});
const { File } = require("megajs");

app.get('/api/profile_pic/:username', async (req, res) => {
  const username = req.params.username;

  const sql = `
    SELECT p.profile_pic_url
    FROM profiles p
    JOIN credentials c ON p.email = c.email
    WHERE c.username = ?
    LIMIT 1
  `;

  db.execute(sql, [username], async (err, rows) => {
    if (err) return res.status(500).send("DB error");
    if (!rows.length || !rows[0].profile_pic_url) {
      return res.sendFile(path.join(__dirname, "uploads/default.jpg"));
    }

    const url = rows[0].profile_pic_url;
    
    // If local URL, serve directly
    if (url.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, url);
      if (fs.existsSync(localPath)) return res.sendFile(localPath);
      return res.sendFile(path.join(__dirname, "uploads/default.jpg"));
    }

    try {
      const file = File.fromURL(url);
      try {
        await file.loadAttributes();
      } catch (e) {
        return res.sendFile(path.join(__dirname, "uploads/default.jpg"));
      }
      res.setHeader("Content-Type", file.mime || "image/jpeg");
      const stream = file.download();
      stream.pipe(res);
      stream.on("error", () => res.sendFile(path.join(__dirname, "uploads/default.jpg")));
    } catch (e) {
      res.sendFile(path.join(__dirname, "uploads/default.jpg"));
    }
  });
});

app.get('/api/cover_pic/:username', async (req, res) => {
  const username = req.params.username;

  const sql = `
    SELECT p.cover_pic_url
    FROM profiles p
    JOIN credentials c ON p.email = c.email
    WHERE c.username = ?
    LIMIT 1
  `;

  db.execute(sql, [username], async (err, rows) => {
    if (err) return res.status(500).send("DB error");
    if (!rows.length || !rows[0].cover_pic_url) {
      return res.status(404).send("Not found");
    }

    const url = rows[0].cover_pic_url;
    
    if (url.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, url);
      if (fs.existsSync(localPath)) return res.sendFile(localPath);
      return res.status(404).send("Not found");
    }

    try {
      const file = File.fromURL(url);
      try {
        await file.loadAttributes();
      } catch (e) {
        return res.status(404).send("Not found");
      }
      res.setHeader("Content-Type", file.mime || "image/jpeg");
      const stream = file.download();
      stream.pipe(res);
      stream.on("error", () => res.status(404).send("Not found"));
    } catch (e) {
      res.status(404).send("Not found");
    }
  });
});
// Update a single profile field for logged-in user
app.patch('/api/profile', (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  const allowed = new Set(['full_name','branch','clubs_part_of','domain','position','year','hometown','bio','zodiac_sign']);
  const field = (req.body.field || '').trim();
  let value = req.body.value;

  if (!allowed.has(field)) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  if (field === 'year') {
    const yr = parseInt(value, 10);
    if (Number.isNaN(yr)) return res.status(400).json({ error: 'Year must be a number' });
    value = yr;
  } else {
    value = (value || '').toString();
  }

  // Find email for current user
  db.execute('SELECT email FROM credentials WHERE username = ? LIMIT 1', [username], (err, rows) => {
    if (err) {
      console.error('Email lookup error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const email = rows[0].email;

    const sql = `UPDATE profiles SET ${field} = ? WHERE email = ?`;
    db.execute(sql, [value, email], (err2, result) => {
      if (err2) {
        console.error('Profile update error:', err2);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json({ success: true, field, value });
    });
  });
});

// Update profile picture
app.post('/api/profile/pic', upload.single('profile_pic'), async (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Upload to cloud (Mega) with local fallback
  let profile_pic_url = null;
  try {
    const filename = `profile-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
    const uploaded = await uploadBufferToCloud({
      buffer: req.file.buffer,
      filename,
      mimeType: req.file.mimetype,
      category: 'profiles'
    });
    if (uploaded && uploaded.url) {
      profile_pic_url = uploaded.url;
    } else {
      const localDir = path.join(__dirname, 'uploads', 'profiles');
      fs.mkdirSync(localDir, { recursive: true });
      const localFilename = `profile-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
      const localPath = path.join(localDir, localFilename);
      fs.writeFileSync(localPath, req.file.buffer);
      profile_pic_url = `/uploads/profiles/${localFilename}`;
      console.warn('Cloud provided no public URL. Using local storage:', profile_pic_url);
    }
  } catch (e) {
    console.error('Cloud upload (profile pic) error:', e);
    try {
      const localDir = path.join(__dirname, 'uploads', 'profiles');
      fs.mkdirSync(localDir, { recursive: true });
      const localFilename = `profile-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
      const localPath = path.join(localDir, localFilename);
      fs.writeFileSync(localPath, req.file.buffer);
      profile_pic_url = `/uploads/profiles/${localFilename}`;
      console.warn('Cloud issue detected. Fell back to local storage:', profile_pic_url);
    } catch (writeErr) {
      console.error('Local upload fallback error:', writeErr);
      return res.status(500).json({ error: 'Cloud upload failed' });
    }
  }

  db.execute('SELECT email FROM credentials WHERE username = ? LIMIT 1', [username], (err, rows) => {
    if (err) {
      console.error('Email lookup error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const email = rows[0].email;

    db.execute('UPDATE profiles SET profile_pic_url = ? WHERE email = ?', [profile_pic_url, email], (err2) => {
      if (err2) {
        console.error('Profile pic update error:', err2);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json({ success: true, profile_pic_url });
    });
  });
});

// Update cover picture
app.post('/api/cover/pic', upload.single('cover_pic'), async (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let cover_pic_url = null;
  try {
    const filename = `cover-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
    const uploaded = await uploadBufferToCloud({
      buffer: req.file.buffer,
      filename,
      mimeType: req.file.mimetype,
      category: 'covers'
    });
    if (uploaded && uploaded.url) {
      cover_pic_url = uploaded.url;
    } else {
      const localDir = path.join(__dirname, 'uploads', 'covers');
      fs.mkdirSync(localDir, { recursive: true });
      const localFilename = `cover-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
      const localPath = path.join(localDir, localFilename);
      fs.writeFileSync(localPath, req.file.buffer);
      cover_pic_url = `/uploads/covers/${localFilename}`;
    }
  } catch (e) {
    console.error('Cover pic upload error:', e);
    return res.status(500).json({ error: 'Upload failed' });
  }

  db.execute('SELECT email FROM credentials WHERE username = ? LIMIT 1', [username], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const email = rows[0].email;

    db.execute('UPDATE profiles SET cover_pic_url = ? WHERE email = ?', [cover_pic_url, email], (err2) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, cover_pic_url });
    });
  });
});

// your log in at right side
app.get('/api/user_profile', (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const username = req.session.username;

  // Get email associated with username, then use email to fetch profile
  db.query("SELECT email FROM credentials WHERE username = ?", [username], (err, credResults) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (credResults.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const email = credResults[0].email;

    db.query("SELECT full_name, zodiac_sign, bio, profile_pic, profile_pic_url, cover_pic_url FROM profiles WHERE email = ?", [email], (err, profileResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }
      if (profileResults.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      // Include username in response for frontend logic
      const profile = profileResults[0];
      res.json({
        username,
        full_name: profile.full_name,
        zodiac_sign: profile.zodiac_sign,
        bio: profile.bio
  ? profile.bio.replace(/[ \t]+/g, " ").trim()
  : "No bio provided",
        profile_pic: profile.profile_pic,
        profile_pic_url: profile.profile_pic_url,
        cover_pic_url: profile.cover_pic_url
      });
    });
  });
});

//explore page profile suggestions
app.get("/api/all_profiles", (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const username = req.session.username;

  // Fetch all profiles except the logged-in user, joining credentials to ensure username
  const sql = `
    SELECT c.username AS username, p.full_name, p.zodiac_sign, p.bio, p.profile_pic, p.profile_pic_url, p.cover_pic_url
    FROM profiles p
    JOIN credentials c ON p.email = c.email
    WHERE c.username != ?
  `;

  db.query(sql, [username], (err, profileResults) => {
    if (err) return res.status(500).json({ error: "DB error" });
    // Always return only DB-backed profiles; no mock fallbacks
    const cleaned = profileResults.map(p => ({
  ...p,
  bio: p.bio
    ? p.bio.trim()
    : "No bio provided"
}));

res.json(cleaned);
  });
});

// on click routing to profile page
app.get("/api/get_profile/:username", (req, res) => {
  const username = req.params.username;

  // Join credentials to find profile by username even if profiles table doesn't store username
  const sql = `
    SELECT c.username AS username, p.email, p.branch, p.clubs_part_of, p.domain, p.position, p.year, p.hometown,
           p.full_name, p.profile_pic, p.profile_pic_url, p.cover_pic_url, p.bio, p.zodiac_sign
    FROM profiles p
    JOIN credentials c ON p.email = c.email
    WHERE c.username = ?
  `;

  db.execute(sql, [username], (err, rows) => {
    if (err) {
      console.error("Get Profile Error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const p = rows[0];

p.bio = p.bio
  ? p.bio.replace(/[ \t]+/g, " ").trim()
  : "No bio provided";

res.json(p);
  });
});


// Search Users API search page prediction
app.get("/api/search_users", (req, res) => {
  const query = req.query.query;

  if (!query || query.trim() === "") {
    return res.json([]); // empty array if nothing typed
  }

  const sql = `
    SELECT c.username AS username, p.full_name, p.bio, p.profile_pic, p.profile_pic_url, p.zodiac_sign
    FROM profiles p
    JOIN credentials c ON p.email = c.email
    WHERE p.full_name LIKE ?
    LIMIT 10
  `;

  db.execute(sql, [`%${query}%`], (err, rows) => {
    if (err) {
      console.error("Search Users Error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json(rows); // directly send the rows
  });
});

// // User vibes (follow)
// app.post("/api/vibe/:targetUsername", (req, res) => {
//   const actor = req.session.username;  // logged in user
//   const target = req.params.targetUsername;

//   if (!actor) return res.status(401).json({ error: "Not logged in" });
//   if (actor === target) return res.status(400).json({ error: "Cannot vibe yourself" });

//   const sql = `
//     INSERT INTO follows (follower_username, following_username)
//     VALUES (?, ?)
//     ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
//   `;
//   db.execute(sql, [actor, target], (err) => {
//     if (err) return res.status(500).json({ error: "DB error" });

//     // Add notification for target
//     const notif = `
//       INSERT INTO notifications (username, actor, type, message)
//       VALUES (?, ?, 'vibe', CONCAT(?, ' vibed you!'))
//     `;
//     db.execute(notif, [target, actor, actor]);

//     res.json({ success: true, message: "Vibe sent" });
//   });
// });

// // Vibe back (follow back)
// app.post("/api/vibe_back/:targetUsername", (req, res) => {
//   const actor = req.session.username;
//   const target = req.params.targetUsername;

//   if (!actor) return res.status(401).json({ error: "Not logged in" });

//   const sql = `
//     INSERT INTO follows (follower_username, following_username)
//     VALUES (?, ?)
//     ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
//   `;
//   db.execute(sql, [actor, target], (err) => {
//     if (err) return res.status(500).json({ error: "DB error" });

//     // Add notification for target
//     const notif = `
//       INSERT INTO notifications (username, actor, type, message)
//       VALUES (?, ?, 'vibe_back', CONCAT(?, ' vibed you back!'))
//     `;
//     db.execute(notif, [target, actor, actor]);

//     res.json({ success: true, message: "Vibe back recorded" });
//   });
// });

// // Get followers
// app.get("/api/followers/:username", (req, res) => {
//   const sql = "SELECT follower_username FROM follows WHERE following_username = ?";
//   db.execute(sql, [req.params.username], (err, rows) => {
//     if (err) return res.status(500).json({ error: "DB error" });
//     res.json(rows);
//   });
// });

// // Get following
// app.get("/api/following/:username", (req, res) => {
//   const sql = "SELECT following_username FROM follows WHERE follower_username = ?";
//   db.execute(sql, [req.params.username], (err, rows) => {
//     if (err) return res.status(500).json({ error: "DB error" });
//     res.json(rows);
//   });
// });

// // Get notifications (full history)
// app.get("/api/notifications", (req, res) => {
//   const username = req.session.username;
//   if (!username) return res.status(401).json({ error: "Not logged in" });

//   const sql = "SELECT * FROM notifications WHERE username = ? ORDER BY created_at DESC";
//   db.execute(sql, [username], (err, rows) => {
//     if (err) return res.status(500).json({ error: "DB error" });
//     res.json(rows);
//   });
// });

// // Mark notifications as seen
// app.post("/api/notifications/mark_seen", (req, res) => {
//   const username = req.session.username;
//   if (!username) return res.status(401).json({ error: "Not logged in" });

//   const sql = "UPDATE notifications SET seen = TRUE WHERE username = ?";
//   db.execute(sql, [username], (err) => {
//     if (err) return res.status(500).json({ error: "DB error" });
//     res.json({ success: true });
//   });
// });

app.post("/api/send_vibe", (req, res) => {
  const actor = req.session.username;
  const { to_username } = req.body;

  if (!actor || !to_username) {
    return res.status(400).json({ error: "Missing data" });
  }
  // 🔥 NEW: Block self-vibing entirely at the server level
  if (actor === to_username) {
    return res.json({ success: false, message: "You cannot vibe yourself." });
  }

  // Check if vibe/follow already exists
  const sqlCheck = `
    SELECT * FROM follows
    WHERE follower_username = ? AND following_username = ?
  `;
  db.execute(sqlCheck, [actor, to_username], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (rows.length > 0) {
      return res.json({ success: false, message: "You are already vibing with this person." });
    }

    // Check if a pending notification already exists
    const sqlNotifCheck = `
      SELECT * FROM notifications
      WHERE username = ? AND actor = ? AND type = 'vibe' AND seen = 0
    `;
    db.execute(sqlNotifCheck, [to_username, actor], (err2, notifRows) => {
      if (err2) return res.status(500).json({ error: "DB error" });
      if (notifRows.length > 0) {
        return res.json({ success: false, message: "Vibe request already sent." });
      }

      // Insert notification
      const sql = `
        INSERT INTO notifications (username, actor, type, message)
        VALUES (?, ?, 'vibe', CONCAT(?, ' sent you a vibe'))
      `;
      db.execute(sql, [to_username, actor, actor], (err3) => {
        if (err3) return res.status(500).json({ error: "DB error" });
        res.json({ success: true, message: "Vibe sent!" });
      });
    });
  });
});

// Withdraw a pending vibe request (before it's accepted)
app.delete("/api/withdraw_vibe", (req, res) => {
  const actor = req.session.username;
  const { to_username } = req.body;

  if (!actor) return res.status(401).json({ error: "Not logged in" });
  if (!to_username) return res.status(400).json({ error: "Missing to_username" });

  // Delete the pending vibe notification sent from actor to to_username
  const sql = `
    DELETE FROM notifications
    WHERE actor = ? AND username = ? AND type = 'vibe' AND seen = 0
  `;
  db.execute(sql, [actor, to_username], (err, result) => {
    if (err) {
      console.error("Withdraw vibe error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    if (result.affectedRows === 0) {
      return res.json({ success: false, message: "No pending vibe request found." });
    }
    res.json({ success: true, message: "Vibe request withdrawn." });
  });
});

app.get("/api/get_notifications", (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: "Not logged in" });

  // Return only UNSEEN notifications for the inbox view
  const sql = `
    SELECT n.id, n.actor, n.type, n.message, n.seen, n.created_at,
           CASE 
             WHEN f.id IS NOT NULL THEN 'accepted'
             WHEN n.seen = 1 THEN 'rejected'
             ELSE 'pending'
           END AS status
    FROM notifications n
    LEFT JOIN follows f 
      ON (f.follower_username = ? AND f.following_username = n.actor)
    WHERE n.username = ? AND n.seen = 0
    ORDER BY n.created_at DESC
  `;

  db.execute(sql, [username, username], (err, rows) => {
    if (err) {
      console.error("Get notifications error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json(rows);
  });
});

// Full notifications history (seen and unseen)
app.get("/api/notifications_history", (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: "Not logged in" });

  const sql = `
    SELECT n.id, n.actor, n.type, n.message, n.seen, n.created_at,
           CASE 
             WHEN f.id IS NOT NULL THEN 'accepted'
             WHEN n.seen = 1 THEN 'rejected'
             ELSE 'pending'
           END AS status
    FROM notifications n
    LEFT JOIN follows f 
      ON (f.follower_username = ? AND f.following_username = n.actor)
    WHERE n.username = ?
    ORDER BY n.created_at DESC
  `;

  db.execute(sql, [username, username], (err, rows) => {
    if (err) {
      console.error("Notifications history error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json(rows);
  });
});


app.post("/api/respond_vibe", (req, res) => {
  const username = req.session.username; // the one receiving the vibe
  const { notificationId, action, actor } = req.body;

  if (!username || !notificationId || !action || !actor) {
    return res.status(400).json({ error: "Missing data" });
  }

  // 🔥 NEW: Automatically trash glitchy self-notifications so they don't crash the server
  if (username === actor) {
    db.execute("DELETE FROM notifications WHERE id = ?", [notificationId]);
    return res.json({ success: false, message: "Glitch removed!" });
  }

  if (action === "accept") {
  // Insert both directions to mark mutual vibe
  const sqlFollow = `
    INSERT IGNORE INTO follows (follower_username, following_username)
    VALUES (?, ?), (?, ?)
  `;
  db.execute(sqlFollow, [username, actor, actor, username], (err) => {
    if (err) {
      console.error("Follow insert error:", err);
      return res.status(500).json({ error: "DB error" });
    }

    // Mark notification as seen
    const sqlNotif = `
      UPDATE notifications SET seen = 1 WHERE id = ?
    `;
    db.execute(sqlNotif, [notificationId], (err) => {
      if (err) {
        console.error("Notification update error:", err);
      }
    });

    // Insert "vibe_back" notification for the actor
    const sqlBack = `
      INSERT INTO notifications (username, actor, type, message)
      VALUES (?, ?, 'vibe_back', CONCAT(?, ' accepted your vibe'))
    `;
    db.execute(sqlBack, [actor, username, username], (err) => {
      if (err) {
        console.error("Vibe back insert error:", err);
      }
    });

    // Return success message to frontend
    res.json({ success: true, message: `You are now vibing with ${actor}!` });
  });
  } else if (action === "reject") {
    const sql = "UPDATE notifications SET seen = 1 WHERE id = ?";
    db.execute(sql, [notificationId], (err) => {
      if (err) {
        console.error("Reject update error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      res.json({ success: true, message: "You rejected the vibe." });
    });

  } else {
    res.status(400).json({ error: "Invalid action" });
  }
});

// 🔥 NEW: Dismiss a general notification (like a new post or message)
app.post("/api/dismiss_notification", (req, res) => {
  const username = req.session.username;
  const { notificationId } = req.body;

  if (!username || !notificationId) {
    return res.status(400).json({ error: "Missing data" });
  }

  const sql = "UPDATE notifications SET seen = 1 WHERE id = ? AND username = ?";
  db.execute(sql, [notificationId, username], (err) => {
    if (err) {
      console.error("Dismiss update error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ success: true, message: "Notification dismissed." });
  });
});


// TEMP DEBUG: dump all profiles
app.get('/api/debug_profiles', (req, res) => {
  db.execute('SELECT username, full_name FROM profiles LIMIT 20', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: rows.length, rows });
  });
});

// Search users by username or full name
app.get('/api/search_v2', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const query = ((req.query.q || req.query.query) || '').trim();
  console.log('[SEARCH] query received:', query);

  if (!query) return res.json([]);
  
  const safeQuery = `%${query}%`;
  
  db.query(
    `SELECT username, full_name, profile_pic_url FROM profiles WHERE username LIKE ? OR full_name LIKE ? ORDER BY username ASC LIMIT 50`,
    [safeQuery, safeQuery],
    (err, rows) => {
      if (err) {
        console.error('Search error:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log('[SEARCH] found rows:', rows.length);
      res.json(rows);
    }
  );
});

// Vibe status for a given target username relative to the logged-in user
app.get("/api/vibe_status/:username", (req, res) => {
  const actor = req.session.username;
  const target = req.params.username;

  if (!actor) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (!target || actor === target) {
    // If target is self or invalid, treat as accepted/self
    return res.json({ status: actor === target ? "accepted" : "none" });
  }

  const sqlAccepted = `
    SELECT 1
    FROM follows f1
    JOIN follows f2
      ON f1.follower_username = f2.following_username
     AND f1.following_username = f2.follower_username
    WHERE f1.follower_username = ? AND f1.following_username = ?
    LIMIT 1
  `;

  db.execute(sqlAccepted, [actor, target], (err, rows) => {
    if (err) {
      console.error("Vibe status error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    if (rows.length > 0) {
      return res.json({ status: "accepted" });
    }

    const sqlPending = `
      SELECT 1 FROM notifications
      WHERE username = ? AND actor = ? AND type = 'vibe' AND seen = 0
      LIMIT 1
    `;
    db.execute(sqlPending, [target, actor], (err2, rows2) => {
      if (err2) {
        console.error("Vibe pending check error:", err2);
        return res.status(500).json({ error: "DB error" });
      }
      if (rows2.length > 0) {
        return res.json({ status: "pending" });
      }
      return res.json({ status: "none" });
    });
  });
});

// Unvibe: remove mutual connection between logged-in user and target
app.delete("/api/unvibe", (req, res) => {
  const actor = req.session.username;
  const { to_username } = req.body;

  if (!actor) return res.status(401).json({ error: "Not logged in" });
  if (!to_username) return res.status(400).json({ error: "Missing to_username" });
  if (actor === to_username) return res.status(400).json({ error: "Cannot unvibe yourself" });

  // Remove both directions of the follow relationship
  const sqlDelete = `
    DELETE FROM follows
    WHERE (follower_username = ? AND following_username = ?)
       OR (follower_username = ? AND following_username = ?)
  `;
  db.execute(sqlDelete, [actor, to_username, to_username, actor], (err) => {
    if (err) {
      console.error("Unvibe delete error:", err);
      return res.status(500).json({ error: "DB error" });
    }

    // Also clean up any pending vibe notifications between the two
    const sqlNotif = `
      UPDATE notifications SET seen = 1
      WHERE (username = ? AND actor = ? AND type IN ('vibe', 'vibe_back'))
         OR (username = ? AND actor = ? AND type IN ('vibe', 'vibe_back'))
    `;
    db.execute(sqlNotif, [actor, to_username, to_username, actor], () => {
      // Non-fatal if this fails
    });

    res.json({ success: true, message: `You have unvibed ${to_username}.` });
  });
});

app.get("/api/vibe_count/:username", (req, res) => {
  const { username } = req.params;

  const sql = `
    SELECT COUNT(*) AS vibes
    FROM follows f1
    JOIN follows f2 
      ON f1.follower_username = f2.following_username
     AND f1.following_username = f2.follower_username
    WHERE f1.follower_username = ?
  `;

  db.execute(sql, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching vibe count:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ username, vibes: rows[0].vibes });
  });
});

// Get followers and following list
app.get("/api/connections/:username", (req, res) => {
  const { username } = req.params;

  // Join credentials to map usernames to profile data via email
  const sqlFollowers = `
    SELECT c.username AS username, p.full_name, p.profile_pic, p.profile_pic_url
    FROM follows f
    JOIN credentials c ON f.follower_username = c.username
    JOIN profiles p ON p.email = c.email
    WHERE f.following_username = ?`;

  const sqlFollowing = `
    SELECT c.username AS username, p.full_name, p.profile_pic, p.profile_pic_url
    FROM follows f
    JOIN credentials c ON f.following_username = c.username
    JOIN profiles p ON p.email = c.email
    WHERE f.follower_username = ?`;

  db.execute(sqlFollowers, [username], (err, followers) => {
    if (err) {
      console.error("Error fetching followers:", err);
      return res.status(500).json({ error: "DB error" });
    }

    db.execute(sqlFollowing, [username], (err2, following) => {
      if (err2) {
        console.error("Error fetching following:", err2);
        return res.status(500).json({ error: "DB error" });
      }

      res.json({ followers, following });
    });
  });
});


// Image proxy endpoint for Mega files
app.get('/api/image/:postId', async (req, res) => {
  const postId = parseInt(req.params.postId, 10);
  if (!postId) return res.status(400).json({ error: 'Invalid post ID' });

  // Get post data from database
  db.execute('SELECT image_url, image_filename FROM posts WHERE id = ?', [postId], async (err, rows) => {
    if (err) {
      console.error('Image proxy DB error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    
    // If it's a local file, serve it directly
    if (post.image_filename && !post.image_url) {
      const localPath = path.join(__dirname, 'uploads', post.image_filename);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      } else {
        return res.status(404).json({ error: 'Local image not found' });
      }
    }

    // If it's a Mega URL, download and stream it
    if (post.image_url && post.image_url.includes('mega.nz')) {
      try {
        const { File } = require('megajs');
        
        // Create file object from Mega URL
        const file = File.fromURL(post.image_url);
        await file.loadAttributes();
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'image/jpeg'); // Default to JPEG, could be improved
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Download and stream the file
        const stream = file.download();
        stream.pipe(res);
        
        stream.on('error', (error) => {
          console.error('Mega download error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download image' });
          }
        });
        
      } catch (error) {
        console.error('Mega image proxy error:', error);
        res.status(500).json({ error: 'Failed to serve Mega image' });
      }
    } else {
      // For other URLs, redirect
      res.redirect(post.image_url);
    }
  });
});
// =====================
// 🔥 Stories Feature
// =====================

// 1. Upload a Story (Now with Caption)
app.post('/api/stories', postUpload.single('image'), async (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  if (!req.file) return res.status(400).json({ error: 'Image is required' });

  const caption = (req.body.caption || '').trim(); // Get the caption!

  let image_url = null;
  try {
    const filename = `story-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
    const uploaded = await uploadBufferToCloud({
      buffer: req.file.buffer, filename, mimeType: req.file.mimetype, category: 'posts'
    });
    if (uploaded && uploaded.url) {
      image_url = uploaded.url;
    } else {
      const localDir = path.join(__dirname, 'uploads', 'posts');
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, filename), req.file.buffer);
      image_url = `/uploads/posts/${filename}`;
    }
  } catch (e) {
    return res.status(500).json({ error: 'Upload failed' });
  }

  // Insert image and caption!
  db.execute('INSERT INTO stories (username, image_url, caption) VALUES (?, ?, ?)', [actor, image_url, caption], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, message: 'Story uploaded!' });
  });
});

// 2. Get the Stories Feed (Exclusively for You and people you follow)
app.get('/api/stories_feed', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // 🔥 UPDATED SQL: Filter by followers
  const sql = `
    SELECT s.username, p.full_name, p.profile_pic_url,
           SUM(CASE WHEN sv.id IS NULL THEN 1 ELSE 0 END) AS unseen_count
    FROM stories s
    JOIN credentials c ON s.username = c.username
    LEFT JOIN profiles p ON c.email = p.email
    LEFT JOIN story_views sv ON s.id = sv.story_id AND sv.viewer_username = ?
    WHERE s.created_at >= NOW() - INTERVAL 24 HOUR
      AND (s.username = ? OR s.username IN (SELECT following_username FROM follows WHERE follower_username = ?))
    GROUP BY s.username, p.full_name, p.profile_pic_url
    ORDER BY unseen_count DESC, MAX(s.created_at) DESC
  `;

  // We pass 'actor' 3 times to handle the 3 filters in the query
  db.execute(sql, [actor, actor, actor], (err, rows) => {
    if (err) {
      console.error('Stories feed fetch error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// 3. Get actual story images AND Captions
app.get('/api/stories/:username', (req, res) => {
  const viewer = req.session.username;
  const sql = `
    SELECT s.id, s.image_url, s.caption, s.created_at,
           IF(v.is_liked, 1, 0) AS is_liked
    FROM stories s
    LEFT JOIN story_views v ON s.id = v.story_id AND v.viewer_username = ?
    WHERE s.username = ? AND s.created_at >= NOW() - INTERVAL 24 HOUR 
    ORDER BY s.created_at ASC
  `;
  db.execute(sql, [viewer || null, req.params.username], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// 🔥 NEW: Delete a Story
app.delete('/api/stories/:id', (req, res) => {
  const actor = req.session.username;
  const storyId = parseInt(req.params.id, 10);
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // Security check: only delete if the logged-in user owns it!
  db.execute('DELETE FROM stories WHERE id = ? AND username = ?', [storyId, actor], (err, result) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (result.affectedRows === 0) return res.status(403).json({ error: 'Unauthorized or not found' });
    
    // Also clean up views for this story
    db.execute('DELETE FROM story_views WHERE story_id = ?', [storyId]);
    res.json({ success: true });
  });
});

// 4. Mark a specific story as seen
app.post('/api/stories/:id/view', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  db.execute('INSERT IGNORE INTO story_views (story_id, viewer_username) VALUES (?, ?)', [req.params.id, actor], () => {
    res.json({ success: true });
  });
});

// Image proxy endpoint for Stories (Mega files)
app.get('/api/story_image/:id', async (req, res) => {
  const storyId = parseInt(req.params.id, 10);
  if (!storyId) return res.status(400).json({ error: 'Invalid story ID' });

  db.execute('SELECT image_url FROM stories WHERE id = ?', [storyId], async (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });

    const story = rows[0];
    
    // 1. If it's a local file, serve it directly
    if (story.image_url && story.image_url.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, story.image_url);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      } else {
        return res.status(404).json({ error: 'Local image not found' });
      }
    }

    // 2. If it's a Mega URL, download and stream it
    if (story.image_url && story.image_url.includes('mega.nz')) {
      try {
        const { File } = require('megajs');
        const file = File.fromURL(story.image_url);
        await file.loadAttributes();
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache to make it load faster
        
        const stream = file.download();
        stream.pipe(res);
        
        stream.on('error', (error) => {
          console.error('Mega download error:', error);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to download image' });
        });
        
      } catch (error) {
        console.error('Mega story image proxy error:', error);
        res.status(500).json({ error: 'Failed to serve Mega image' });
      }
    } else {
      // 3. For standard web URLs, just redirect
      res.redirect(story.image_url);
    }
  });
});

// 5. Get viewers for a specific story (Only the author can see this)
app.get('/api/stories/:id/viewers', (req, res) => {
  const actor = req.session.username;
  const storyId = parseInt(req.params.id, 10);
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // First, verify that the logged-in user actually owns this story
  db.execute('SELECT username FROM stories WHERE id = ?', [storyId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length === 0 || rows[0].username !== actor) {
      return res.status(403).json({ error: 'Unauthorized: You can only see viewers on your own stories.' });
    }

    // Fetch the list of users who have viewed it (excluding the owner themselves)
    const sql = `
      SELECT sv.viewer_username, p.full_name, p.profile_pic_url, sv.is_liked
      FROM story_views sv
      JOIN credentials c ON sv.viewer_username = c.username
      JOIN profiles p ON c.email = p.email
      WHERE sv.story_id = ? AND sv.viewer_username != ?
      ORDER BY sv.viewed_at DESC
    `;
    db.execute(sql, [storyId, actor], (err2, viewers) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json(viewers);
    });
  });
});

// 5b. Get Story Replies
app.get('/api/stories/:id/replies', (req, res) => {
  const actor = req.session.username;
  const storyId = parseInt(req.params.id, 10);
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // First, verify that the logged-in user actually owns this story
  db.execute('SELECT username FROM stories WHERE id = ?', [storyId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length === 0 || rows[0].username !== actor) {
      return res.status(403).json({ error: 'Unauthorized: You can only see replies on your own stories.' });
    }

    // Fetch replies from notifications AND legacy direct_messages
    const sql = `
      SELECT n.actor AS sender_username, p.full_name, p.profile_pic_url, n.message AS message_text, n.created_at
      FROM notifications n
      JOIN credentials c ON n.actor = c.username
      JOIN profiles p ON c.email = p.email
      WHERE n.username = ? 
        AND n.type = 'story_reply'
        AND n.message LIKE ? 

      UNION ALL

      SELECT dm.sender_username, p.full_name, p.profile_pic_url, dm.message_text, dm.created_at
      FROM direct_messages dm
      JOIN credentials c ON dm.sender_username = c.username
      JOIN profiles p ON c.email = p.email
      WHERE dm.receiver_username = ? 
        AND dm.message_text LIKE ? 
        AND dm.message_text LIKE '💬 Replied to story:%'

      ORDER BY created_at DESC
    `;
    const storyTag = `%[STORY:${storyId}]%`;
    
    db.execute(sql, [actor, storyTag, actor, storyTag], (err2, replies) => {
      if (err2) {
        console.error('Replies fetch error:', err2);
        return res.status(500).json({ error: 'DB error' });
      }
      
      // Clean up the message text to show just the reply
      const cleanedReplies = replies.map(r => {
        let cleanText = r.message_text.replace(/^Replied:\s*/, '').trim();
        cleanText = cleanText.replace(/^💬 Replied to story:\s*/, '').trim();
        cleanText = cleanText.replace(/\s*\[STORY:\d+\]\s*$/, '').trim();
        return { ...r, message_text: cleanText };
      });
      
      res.json(cleanedReplies);
    });
  });
});

// 6. React or Reply to a story (Sends straight to DMs)
app.post('/api/stories/:id/react', (req, res) => {
  const actor = req.session.username;
  const storyId = parseInt(req.params.id, 10);
  const { type, message } = req.body; // type can be 'like' or 'comment'
  
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // 1. Find the owner of the story
  db.execute('SELECT username FROM stories WHERE id = ?', [storyId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    const owner = rows[0].username;
    if (owner === actor) return res.status(400).json({ error: 'Cannot react to your own story' });

    if (type === 'unlike') {
      db.execute('UPDATE story_views SET is_liked = FALSE WHERE story_id = ? AND viewer_username = ?', [storyId, actor], () => {
        // Remove the notification
        db.execute('DELETE FROM notifications WHERE actor = ? AND username = ? AND message LIKE ?', [actor, owner, `%[STORY:${storyId}]%`]);
        res.json({ success: true });
      });
      return;
    }

    // 2. If it's a Like, update the story_views table
    if (type === 'like') {
      db.execute('UPDATE story_views SET is_liked = TRUE WHERE story_id = ? AND viewer_username = ?', [storyId, actor]);
    }

    // 3. Format the message and send it to Notifications only!
    const notifType = type === 'like' ? 'story_like' : 'story_reply';
    const notifMsg = type === 'like' ? `${actor} liked your story [STORY:${storyId}]` : `Replied: ${message} [STORY:${storyId}]`;
    
    db.execute('INSERT INTO notifications (username, actor, type, message) VALUES (?, ?, ?, ?)', [owner, actor, notifType, notifMsg], (nErr) => {
      if (nErr) return res.status(500).json({ error: 'Failed to send notification' });
      res.json({ success: true });
    });
  });
});



// =====================
// Posts Feature Endpoints
// =====================

// Create a new post (image, text, or both)
app.post('/api/posts', postUpload.single('image'), async (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  const caption = (req.body.caption || '').trim();

  // 🔥 Fix: Require EITHER an image OR a caption
  if (!req.file && !caption) {
    return res.status(400).json({ error: 'Either an image or a thought is required' });
  }

  let image_url = null;
  
  // 🔥 Fix: Only try to upload to the cloud if a file was actually attached
  if (req.file) {
    try {
      const filename = `post-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
      const uploaded = await uploadBufferToCloud({
        buffer: req.file.buffer,
        filename,
        mimeType: req.file.mimetype,
        category: 'posts'
      });
      if (uploaded && uploaded.url) {
        image_url = uploaded.url;
      } else {
        const localDir = path.join(__dirname, 'uploads', 'posts');
        fs.mkdirSync(localDir, { recursive: true });
        const localFilename = `post-${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(req.file.originalname)}`;
        const localPath = path.join(localDir, localFilename);
        fs.writeFileSync(localPath, req.file.buffer);
        image_url = `/uploads/posts/${localFilename}`;
        console.warn('Cloud provided no public URL. Using local storage:', image_url);
      }
    } catch (e) {
      console.error('Upload error:', e);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }

  const sql = `
    INSERT INTO posts (author_username, image_url, caption)
    VALUES (?, ?, ?)
  `;
  db.execute(sql, [actor, image_url, caption], (err, result) => {
    if (err) {
      console.error('Post insert error:', err);
      return res.status(500).json({ error: 'DB error' });
    }

    // Instantly notify all of this user's followers
    const followersSql = `SELECT follower_username FROM follows WHERE following_username = ?`;
    db.execute(followersSql, [actor], (err, rows) => {
      if (!err && rows && rows.length > 0) {
        const notifSql = `INSERT INTO notifications (username, actor, type, message) VALUES ?`;
        const notifValues = rows.map(r => [
          r.follower_username, 
          actor, 
          'new_post', 
          `${actor} just published a new post!`
        ]);
        db.query(notifSql, [notifValues], (nErr) => {
          if (nErr) console.error('Notification bulk insert error:', nErr);
        });
      }
    });

    res.json({ success: true, post_id: result.insertId, message: 'Post created' });
  });
});

// List posts ONLY from the user and their connections (newest first)
app.get('/api/posts', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  const sql = `
    SELECT p.id, p.author_username, p.image_filename, p.image_url, p.caption, p.created_at,
           pr.full_name, pr.profile_pic, pr.profile_pic_url,
           (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
           (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count,
           CASE WHEN EXISTS (SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.username = ?) THEN 1 ELSE 0 END AS liked_by_me
    FROM posts p
    LEFT JOIN credentials c ON c.username = p.author_username
    LEFT JOIN profiles pr ON pr.email = c.email
    WHERE p.author_username = ? 
       OR p.author_username IN (SELECT following_username FROM follows WHERE follower_username = ?)
    ORDER BY p.created_at DESC
  `;

  // We now pass 'actor' 3 times to fill in the 3 question marks (?) in the SQL query
  db.execute(sql, [actor, actor, actor], (err, rows) => {
    if (err) {
      console.error('Posts fetch error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// Delete a post
app.delete('/api/posts/:id', (req, res) => {
  const actor = req.session.username;
  const postId = parseInt(req.params.id, 10);
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  // Security check: only delete if the logged-in user owns it
  db.execute('DELETE FROM posts WHERE id = ? AND author_username = ?', [postId, actor], (err, result) => {
    if (err) {
      console.error('Post delete error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (result.affectedRows === 0) {
      return res.status(403).json({ error: 'Unauthorized or post not found' });
    }
    
    // Clean up associated likes and comments
    db.execute('DELETE FROM post_likes WHERE post_id = ?', [postId]);
    db.execute('DELETE FROM post_comments WHERE post_id = ?', [postId]);
    
    res.json({ success: true });
  });
});

// Get a single post
app.get('/api/posts/:id', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const postId = parseInt(req.params.id, 10);

  const sql = `
    SELECT p.id, p.author_username, p.image_filename, p.image_url, p.caption, p.created_at,
           pr.full_name, pr.profile_pic, pr.profile_pic_url,
           (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
           (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count,
           CASE WHEN EXISTS (SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.username = ?) THEN 1 ELSE 0 END AS liked_by_me
    FROM posts p
    LEFT JOIN credentials c ON c.username = p.author_username
    LEFT JOIN profiles pr ON pr.email = c.email
    WHERE p.id = ?
    LIMIT 1
  `;
  db.execute(sql, [actor, postId], (err, rows) => {
    if (err) {
      console.error('Post fetch error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  });
});

// Like a post
app.post('/api/posts/:id/like', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const postId = parseInt(req.params.id, 10);

  const sql = `
    INSERT INTO post_likes (post_id, username)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE post_id = post_id
  `;
  db.execute(sql, [postId, actor], (err) => {
    if (err) {
      console.error('Post like error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    db.execute('SELECT COUNT(*) AS likes_count FROM post_likes WHERE post_id = ?', [postId], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: 'DB error' });

      // 🔔 Notify the post owner (skip if actor liked their own post)
      db.execute('SELECT author_username FROM posts WHERE id = ?', [postId], (err3, postRows) => {
        if (!err3 && postRows.length > 0) {
          const owner = postRows[0].author_username;
          if (owner !== actor) {
            db.execute(
              `INSERT INTO notifications (username, actor, type, message) VALUES (?, ?, 'post_like', ?)`,
              [owner, actor, `${actor} liked your post`],
              (nErr) => { if (nErr) console.error('Like notification error:', nErr); }
            );
          }
        }
      });

      res.json({ success: true, likes_count: rows2[0].likes_count });
    });
  });
});

// Unlike a post
app.delete('/api/posts/:id/like', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const postId = parseInt(req.params.id, 10);

  db.execute('DELETE FROM post_likes WHERE post_id = ? AND username = ?', [postId, actor], (err) => {
    if (err) {
      console.error('Post unlike error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    db.execute('SELECT COUNT(*) AS likes_count FROM post_likes WHERE post_id = ?', [postId], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, likes_count: rows2[0].likes_count });
    });
  });
});

// 🔥 NEW: Get users who liked a post
app.get('/api/posts/:id/likes', (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const sql = `
    SELECT pl.username, pr.full_name, pr.profile_pic_url
    FROM post_likes pl
    JOIN credentials c ON pl.username = c.username
    JOIN profiles pr ON c.email = pr.email
    WHERE pl.post_id = ?
    ORDER BY pl.created_at DESC
  `;
  db.execute(sql, [postId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// Get comments for a post
app.get('/api/posts/:id/comments', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const postId = parseInt(req.params.id, 10);

  const sql = `
    SELECT pc.id, pc.post_id, pc.username, pc.comment_text, pc.created_at,
           pr.full_name, pr.profile_pic
    FROM post_comments pc
    LEFT JOIN credentials c ON c.username = pc.username
    LEFT JOIN profiles pr ON pr.email = c.email
    WHERE pc.post_id = ?
    ORDER BY pc.created_at ASC
  `;
  db.execute(sql, [postId], (err, rows) => {
    if (err) {
      console.error('Post comments fetch error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// Add a comment to a post
app.post('/api/posts/:id/comments', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const postId = parseInt(req.params.id, 10);
  const { comment } = req.body;
  const text = (comment || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });

  const sql = `
    INSERT INTO post_comments (post_id, username, comment_text)
    VALUES (?, ?, ?)
  `;
  db.execute(sql, [postId, actor, text], (err) => {
    if (err) {
      console.error('Post comment insert error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    db.execute('SELECT COUNT(*) AS comments_count FROM post_comments WHERE post_id = ?', [postId], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: 'DB error' });

      // 🔔 Notify the post owner (skip if actor commented on their own post)
      db.execute('SELECT author_username FROM posts WHERE id = ?', [postId], (err3, postRows) => {
        if (!err3 && postRows.length > 0) {
          const owner = postRows[0].author_username;
          if (owner !== actor) {
            db.execute(
              `INSERT INTO notifications (username, actor, type, message) VALUES (?, ?, 'post_comment', ?)`,
              [owner, actor, `${actor} commented on your post [POST:${postId}]`],
              (nErr) => { if (nErr) console.error('Comment notification error:', nErr); }
            );
          }
        }
      });

      res.json({ success: true, comments_count: rows2[0].comments_count });
    });
  });
});

// =====================
// Chat Feature Endpoints
// =====================

// List conversation threads for the logged-in user
app.get('/api/chats', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  const sql = `
    SELECT conv.other_username,
           (SELECT message_text FROM direct_messages dm2 WHERE dm2.id = conv.last_id) AS last_text,
           (SELECT created_at FROM direct_messages dm2 WHERE dm2.id = conv.last_id) AS last_at,
           (SELECT COUNT(*) FROM direct_messages dmu 
             WHERE dmu.sender_username = conv.other_username 
               AND dmu.receiver_username = ? 
               AND dmu.is_read = 0
               AND dmu.deleted_by_receiver = 0) AS unread_count,
           pr.full_name, pr.profile_pic, pr.profile_pic_url
    FROM (
      SELECT 
        CASE WHEN sender_username = ? THEN receiver_username ELSE sender_username END AS other_username,
        MAX(id) AS last_id
      FROM direct_messages
      WHERE (sender_username = ? AND deleted_by_sender = 0) 
         OR (receiver_username = ? AND deleted_by_receiver = 0)
      GROUP BY other_username
    ) conv
    LEFT JOIN credentials c ON c.username = conv.other_username
    LEFT JOIN profiles pr ON pr.email = c.email
    ORDER BY last_at DESC
  `;
  
  db.execute(sql, [actor, actor, actor, actor], (err, rows) => {
    if (err) {
      console.error('Chats list error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// Get messages with a specific user
app.get('/api/messages/:username', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const other = req.params.username;

  // Mark messages from 'other' to 'actor' as read when the conversation is opened
  db.execute('UPDATE direct_messages SET is_read = 1 WHERE sender_username = ? AND receiver_username = ? AND is_read = 0 AND deleted_by_receiver = 0', [other, actor], (updateErr) => {
    if (updateErr) console.error('Mark read error:', updateErr);

    const sql = `
      SELECT id, sender_username, receiver_username, message_text, created_at, is_read, is_deleted_for_everyone
      FROM direct_messages
      WHERE ((sender_username = ? AND receiver_username = ? AND deleted_by_sender = 0) 
         OR (sender_username = ? AND receiver_username = ? AND deleted_by_receiver = 0))
      ORDER BY id ASC
      LIMIT 500
    `;

    db.execute(sql, [actor, other, other, actor], (err, rows) => {
      if (err) {
        console.error('Messages fetch error:', err);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json(rows);
    });
  });
});

// Delete a DM
app.post('/api/messages/:id/delete', (req, res) => {
  const actor = req.session.username;
  const msgId = parseInt(req.params.id, 10);
  const { type } = req.body; // 'me' or 'everyone'

  if (!actor) return res.status(401).json({ error: 'Not logged in' });

  db.execute('SELECT sender_username, receiver_username FROM direct_messages WHERE id = ?', [msgId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    
    const msg = rows[0];
    const isSender = msg.sender_username === actor;
    const isReceiver = msg.receiver_username === actor;

    if (!isSender && !isReceiver) return res.status(403).json({ error: 'Unauthorized' });

    if (type === 'everyone') {
      if (!isSender) return res.status(403).json({ error: 'Only the sender can delete for everyone' });
      
      db.execute(
        "UPDATE direct_messages SET is_deleted_for_everyone = 1, message_text = '🚫 This message was deleted' WHERE id = ?",
        [msgId],
        (uErr) => {
          if (uErr) return res.status(500).json({ error: 'DB error' });
          res.json({ success: true });
        }
      );
    } else if (type === 'me') {
      let field = isSender ? 'deleted_by_sender' : 'deleted_by_receiver';
      db.execute(`UPDATE direct_messages SET ${field} = 1 WHERE id = ?`, [msgId], (uErr) => {
        if (uErr) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
      });
    } else {
      res.status(400).json({ error: 'Invalid type' });
    }
  });
});

// Send a message to a specific user
app.post('/api/messages/:username', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const other = req.params.username;
  const text = (req.body.message || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty' });
  if (actor === other) return res.status(400).json({ error: 'Cannot message yourself' });

  // 🔥 NEW: Check if they are mutually Vibing (connected) before allowing the message!
  const vibeCheckSql = `
    SELECT 1 
    FROM follows f1
    JOIN follows f2 
      ON f1.follower_username = f2.following_username 
     AND f1.following_username = f2.follower_username
    WHERE f1.follower_username = ? AND f1.following_username = ?
    LIMIT 1
  `;

  db.execute(vibeCheckSql, [actor, other], (err, rows) => {
    if (err) {
      console.error('Vibe check error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    
    // If no mutual connection is found, block the message
    if (rows.length === 0) {
      return res.json({ success: false, error: 'You must be Vibing with this person to chat!' });
    }

    // They are vibing! Proceed to send the message...
    const sql = `
      INSERT INTO direct_messages (sender_username, receiver_username, message_text)
      VALUES (?, ?, ?)
    `;
    db.execute(sql, [actor, other, text], (insertErr, result) => {
      if (insertErr) {
        console.error('Message insert error:', insertErr);
        return res.status(500).json({ error: 'DB error' });
      }

      // Create a notification for the receiver
      const notifSql = `
        INSERT INTO notifications (username, actor, type, message)
        VALUES (?, ?, 'message', CONCAT(?, ' sent you a message'))
      `;
      db.execute(notifSql, [other, actor, actor], (nErr) => {
        if (nErr) console.error('Message notification insert error:', nErr);
        res.json({ success: true, message_id: result.insertId });
      });
    });
  });
});

// Mark messages from a user as read
app.post('/api/messages/:username/mark_read', (req, res) => {
  const actor = req.session.username;
  if (!actor) return res.status(401).json({ error: 'Not logged in' });
  const other = req.params.username;

  const sql = `
    UPDATE direct_messages
    SET is_read = 1, read_at = CURRENT_TIMESTAMP
    WHERE sender_username = ? AND receiver_username = ? AND is_read = 0
  `;
  db.execute(sql, [other, actor], (err) => {
    if (err) {
      console.error('Mark read error:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});