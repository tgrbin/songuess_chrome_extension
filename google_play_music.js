/*
 * This is a content script for hosting a game from Google Play Music.
 */

const Selectors = {
  startPlaylistButton: '#playButton',
  playPauseButton: '#player-bar-play-pause',
  nextButton: '#player-bar-forward',
  currentTitle: '#currently-playing-title',
  sliderBar: '#sliderBar'
};

// Clicking the pause button seems like a simple operation, so we just click
// and wait for a short time.
const AFTER_PAUSE_DELAY = 100;
// After initiating some actions, we poll the page state to make sure we end
// up in the expected state. For example, after clicking next we poll to make
// sure the title is not the same as it was.
const NEXT_STATE_POLL_RATE = 100;
// We poll this many times until giving up.
const NEXT_STATE_MAX_ITERATIONS = 40;
// Poll rate for the song progress slider, used to detect that the song ended.
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickNextAndSendTitle() {
  const oldTitle = getCurrentTitle();

  if (!clickSelector(Selectors.nextButton, messages.type.moveToNextSong)) {
    return;
  }

  for (let i = 0; i < NEXT_STATE_MAX_ITERATIONS; ++i) {
    await sleep(NEXT_STATE_POLL_RATE);
    if (getCurrentTitle() !== oldTitle) {
      sendTitle();
      return;
    }
  }

  sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
}

async function initialStartPlaylist() {
  if (!clickSelector(Selectors.startPlaylistButton, messages.type.moveToNextSong)) {
    return;
  }

  for (let i = 0; i < NEXT_STATE_MAX_ITERATIONS; ++i) {
    await sleep(NEXT_STATE_POLL_RATE);
    if (getCurrentTitle() !== null && currentlyPlaying()) {
      if (!clickSelector(Selectors.playPauseButton, messages.type.moveToNextSong)) {
        return;
      }
      setTimeout(sendTitle, AFTER_PAUSE_DELAY);
      return;
    }
  }

  sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
}

async function startPlaying() {
  if (currentlyPlaying()) {
    // startPlaying should only be called after moveToNext, so the song should
    // currently be paused.
    console.log('SHOULD NEVER HAPPEN');
    return true;
  }

  for (let i = 0; i < NEXT_STATE_MAX_ITERATIONS; ++i) {
    if (!clickSelector(Selectors.playPauseButton, messages.type.startPlaying)) {
      return false;
    }
    await sleep(NEXT_STATE_POLL_RATE);
    if (currentlyPlaying()) {
      chrome.runtime.sendMessage(messages.newMessage(messages.type.startPlaying));
      return true;
    }
  }

  sendError(messages.type.startPlaying, messages.status.failedToStartPlaying);
  return false;
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
      if (currentlyPlaying()) {
        clickSelector(Selectors.playPauseButton, messageType);
        setTimeout(clickNextAndSendTitle, AFTER_PAUSE_DELAY);
      } else {
        clickNextAndSendTitle();
      }
    } else {
      initialStartPlaylist();
    }
  } else if (messageType == messages.type.startPlaying) {
    // This assumes moveToNextSong was called beforehand.
    // It makes sense, because you can't know the title that's about to play
    // unless you previously called moveToNextSong.
    if (startPlaying()) {
      songProgressInterval = setInterval(checkSongProgress, SONG_PROGRESS_POLL_RATE);
    }
  } else if (messageType == messages.type.detachRoom) {
    console.log('got detach room message');
    stopPlaying();
  }
});
