console.log('hi from popup');

function showSpinner() {
  $('#spinner').show();
  $('#statusMessage').hide();
}

function showMessage(message) {
  $('#spinner').hide();
  $('#statusMessage').text(message);
  $('#statusMessage').show();
}

$(function() {
  chrome.runtime.sendMessage(messages.newMessage(messages.type.isAttached),
    function(response) {
      if (response == false) {
        $('#attach_ui').show();
        $('#detach_ui').hide();
      } else {
        $('#detach_ui').show();
        $('#attach_ui').hide();
      }
  });

  $('#attach_button').click(function() {
    showSpinner();

    const rawName = $('#room_name').val();
    const name = rawName.startsWith('#')? rawName: ('#' + rawName);

    chrome.runtime.sendMessage(messages.newMessage(
      messages.type.attachToRoom,
      {roomName: name}
    ));
  });

  $('#detach_button').click(function() {
    $('#attach_ui').show();
    $('#detach_ui').hide();
    chrome.runtime.sendMessage(messages.newMessage(messages.type.detachRoom));
  });
});

$(document).on('keypress', 'input', function(e) {
  if (e.keyCode == 13) { // enter pressed
    $('#attach_button').click();
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('got message: ', message);

  const messageType = messages.getType(message);

  if (messageType == messages.type.startedStreaming) {
    showMessage('');
    $('#detach_ui').show();
    $('#attach_ui').hide();
  } else if (messageType == messages.type.attachToRoom) {
    // OK status can be ignored here, we're waiting for 'startedStreaming'
    // message in that case.
    if (messages.getStatus(message) != messages.status.ok) {
      showMessage(message.data);
    }
  }
});
