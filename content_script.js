const Selectors = {
  startPlaylistButton: '#playButton',
  playPauseButton: '#player-bar-play-pause',
  nextButton: '#player-bar-forward',
  currentTitle: '#currently-playing-title',
  sliderBar: '#sliderBar'
};

// Some click actions wait this long after executing.
const AFTER_CLICK_DELAY_MS = 2500;
const SONG_PROGRESS_POLL_RATE = 400;

let songProgressInterval = null;

console.log('hi from content script: ', document.URL);

// The current title is there iff the play bar is ready.
// When the bar is ready, one can use the playPauseButton.
// Otherwise, we have to click startPlaylistButton to start playing.
function playBarReady() {
  console.log('play bar ready:', (document.querySelector(Selectors.currentTitle) !== null));
  return document.querySelector(Selectors.currentTitle) !== null;
}

function currentlyPlaying() {
  const el = document.querySelector(Selectors.playPauseButton);
  console.log('currently playing:', (el.title == 'Pause'));
  return el.title == 'Pause';
}

function getCurrentTitle() {
  const el = document.querySelector(Selectors.currentTitle);
  return el? el.textContent: null;
}

// Returns a value in milliseconds.
function getSongTimeRemainingMs() {
  const el = document.querySelector(Selectors.sliderBar);
  const currentValue = parseInt(el.ariaValueNow);
  const maxValue = parseInt(el.ariaValueMax);
  return maxValue - currentValue;
}

function stopPlaying() {
  if (songProgressInterval !== null) {
    clearInterval(songProgressInterval);
  }
  if (currentlyPlaying()) {
    clickSelector(Selectors.playPauseButton);
  }
}

function checkSongProgress() {
  // We add a bit to make sure one poll falls into the (end - poll_rate, end) interval.
  if (getSongTimeRemainingMs() < SONG_PROGRESS_POLL_RATE + 100) {
    console.log('song done');
    stopPlaying();
    chrome.runtime.sendMessage(messages.newMessage(messages.type.songHasEnded));
  }
}

function clickSelector(selector, messageType) {
  console.log('trying to click selector: ', selector);
  const el = document.querySelector(selector);
  if (el) {
    el.click();
    return true;
  } else {
    sendError(messageType, messages.status.selectorNotFound);
    return false;
  }
}

function sendTitle() {
  // Message type we're sending from here is always moveToNextSong.
  // That's the message that triggered searching for a title, and
  // when the search is done we send the same type of message back.
  const title = getCurrentTitle();
  if (title !== null) {
    chrome.runtime.sendMessage(messages.newMessage(
      messages.type.moveToNextSong,
      {
        title: title
      })
    );
  } else {
    sendError(messages.type.moveToNextSong, messages.status.titleNotFound);
  }
}

function sendError(messageType, error) {
  chrome.runtime.sendMessage(messages.newError(messageType, error));
}

chrome.runtime.onMessage.addListener(function(message) {
  console.log('got message: ', message);

  const messageType = messages.getType(message);

  if (messageType == messages.type.moveToNextSong) {
    if (songProgressInterval !== null) {
      clearInterval(songProgressInterval);
      songProgressInterval = null;
    }

    if (playBarReady()) {
      const clickNextAndSendTitle = function() {
        clickSelector(Selectors.nextButton, messageType);
        setTimeout(function() {
          sendTitle();
        }, AFTER_CLICK_DELAY_MS);
      };

      if (currentlyPlaying()) {
        clickSelector(Selectors.playPauseButton, messageType);
        setTimeout(clickNextAndSendTitle, AFTER_CLICK_DELAY_MS);
      } else {
        clickNextAndSendTitle();
      }
    } else {
      clickSelector(Selectors.startPlaylistButton, messageType);
      setTimeout(function() {
        clickSelector(Selectors.playPauseButton, messageType);
        setTimeout(function() {
          clickSelector(Selectors.nextButton, messageType);
          setTimeout(function() {
            sendTitle();
          }, AFTER_CLICK_DELAY_MS);
        }, AFTER_CLICK_DELAY_MS);
      }, AFTER_CLICK_DELAY_MS);
    }
  } else if (messageType == messages.type.startPlaying) {
    // This assumes moveToNextSong was called beforehand.
    // It makes sense, because you can't know the title that's about to play
    // unless you previously called moveToNextSong.
    if (clickSelector(Selectors.playPauseButton, messageType)) {
      chrome.runtime.sendMessage(messages.newMessage(messageType));
    }
    songProgressInterval = setInterval(checkSongProgress, SONG_PROGRESS_POLL_RATE);
  } else if (messageType == messages.type.detachRoom) {
    console.log('got detach room message');
    stopPlaying();
  }
});
