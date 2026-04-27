document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form'); // Select the form element

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent the default form submission

    // Optionally, you can do validation or AJAX submission here

    // Redirect to explore page after form submission
    window.location.href = '/explore/explore.html';
  });
});
