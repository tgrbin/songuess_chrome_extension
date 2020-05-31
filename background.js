//const WS_URL = 'ws://localhost:8080';
const WS_URL = 'wss://songuess.live/ws/';
const CHUNK_SIZE_MS = 5000;

let webSocket = null;
let attachedInfo = null;

function initSocket() {
  webSocket = new WebSocket(WS_URL);

  webSocket.onmessage = function (event) {
    const message = JSON.parse(event.data); 
    console.log('got ws message: ', message);

    const messageType = messages.getType(message);
    if (messageType == messages.type.attachToRoom) {
      if (messages.getStatus(message) == messages.status.ok) {
        startStreaming();
      } else {
        chrome.runtime.sendMessage(message);
      }
    } else if (messageType == messages.type.moveToNextSong) {
      stopRecorder();
      sendToAttachedTab(message);
    } else if (messageType == messages.type.startPlaying) {
      startRecorder();
      sendToAttachedTab(message);
    }
  };

  webSocket.onerror = function (event) {
    console.log('ws error connecting: ', event);
    chrome.runtime.sendMessage(messages.newError(
      messages.type.attachToRoom,
      messages.status.socketError,
      'failed to connect, maybe wrong server URL?'
    ));
  };

  webSocket.onclose = function (event) {
    console.log('socket closed by the server');
    webSocket = null;
  }
}

function sendToAttachedTab(o) {
  if (attachedInfo === null) {
    console.log('tab not attached, failed to send: ', o);
  } else {
    chrome.tabs.sendMessage(attachedInfo.tabId, o);
  }
}

function sendToWebSocket(o) {
  console.log('sending to ws: ', o);
  webSocket.send(JSON.stringify(o));
}

function startStreaming() {
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabCapture.capture({
      audio: true,
      video: false
    }, function(stream) {
      console.log("got stream: ", stream);

      var recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function (e) {
        console.log('ondataavailable:', e.data);
        e.data.arrayBuffer().then(function (buffer) {
          console.log('buffer:', buffer);
          if (webSocket !== null) {
            webSocket.send(buffer)
          }
        });
      };

      attachedInfo = {
        tabId: tabs[0].id,
        stream: stream,
        recorder: recorder
      };

      const message = messages.newMessage(messages.type.startedStreaming);
      chrome.runtime.sendMessage(message);
      sendToWebSocket(message);
    });
  });
}

function stopRecorder() {
  console.log('stopping recorder');
  if (attachedInfo.recorder && attachedInfo.recorder.state != 'inactive') {
    attachedInfo.recorder.stop();
  }
}

function startRecorder() {
  console.log('starting recorder');
  if (attachedInfo !== null) {
    attachedInfo.recorder.start(CHUNK_SIZE_MS);    
  }
}

function stopStreaming() {
  if (attachedInfo !== null) {
    stopRecorder();
    if (attachedInfo.stream) {
      attachedInfo.stream.getTracks().forEach(track => track.stop());
    }
    attachedInfo = null;
  }
}

function attachToRoom(roomName) {
  sendToWebSocket(messages.newMessage(
    messages.type.attachToRoom,
    {roomName: roomName}
  ));
}

// Message handling.
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('got message: ', message);

  const messageType = messages.getType(message);

  if (messageType == messages.type.attachToRoom) {
    const roomName = messages.getData(message).roomName;
    if (webSocket === null) {
      initSocket();
      webSocket.onopen = function() {
        attachToRoom(roomName);
      };
    } else {
      attachToRoom(roomName);
    }
  } else if (messageType == messages.type.detachRoom) {
    if (attachedInfo === null) {
      console.log('unexpected state, got detach while not streaming');
    } else {
      // Forward detachRoom to the content script, to stop playing.
      sendToAttachedTab(message);
      stopStreaming();
      if (webSocket !== null) {
        webSocket.close();
        webSocket = null;
      }
    }
  } else if (messageType == messages.type.isAttached) {
    sendResponse(attachedInfo !== null);
  // These messages are just propagated to the web socket.
  } else if (messageType == messages.type.moveToNextSong ||
             messageType == messages.type.startPlaying ||
             messageType == messages.type.songHasEnded) {
    sendToWebSocket(message);
  }
});

// Enable songuess icon (page action) for pages matching these URLs.
chrome.runtime.onInstalled.addListener(function() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { urlPrefix: 'https://play.google.com/music' }
        })
      ],
      actions: [ new chrome.declarativeContent.ShowPageAction() ]
    }]);
  });
});
