$(function() {
  // Read the current defaults.
  chrome.storage.sync.get({
    serverUrl: '',
  }, function(values) {
    $("#server_url").val(values.serverUrl);
  });

  // Update the defaults on click.
  $('#save_button').click(function() {
    chrome.storage.sync.set({
      serverUrl: $('#server_url').val(),
    });
  });
});

