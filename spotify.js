/*
 * This is a content script for hosting a game from Spotify.
 */

const Selectors = {
  playButton:
    ".Root__top-container button[data-testid='control-button-play']",
  pauseButton:
    ".Root__top-container button[data-testid='control-button-pause']",
  nextButton: 
    ".Root__top-container button[data-testid='control-button-skip-forward']",
  currentTitle: ".Root__now-playing-bar a[data-testid='nowplaying-track-link']",
  sliderBar: ".Root__top-container .playback-bar .progress-bar__bg"
};

// After initiating some actions, we poll the page state to make sure we end
// up in the expected state. For example, after clicking next we poll to make
// sure the title is not the same as it was.
const NEXT_STATE_POLL_RATE = 200;
// We poll this many times until giving up.
const NEXT_STATE_MAX_ITERATIONS = 20;
// Poll rate for the song progress slider, used to detect that the song ended.
const SONG_PROGRESS_POLL_RATE = 400;

let songProgressInterval = null;

console.log('hi from content script: ', document.URL);

function currentlyLoading() {
  const loadingRegex = /\bcontrol-button--loading\b/;
  const playButton = document.querySelector(Selectors.playButton);
  const pauseButton = document.querySelector(Selectors.pauseButton);
  if (playButton) {
    return loadingRegex.test(playButton.className);
  } else if (pauseButton) {
    return loadingRegex.test(pauseButton.className);
  }
  // We couldn't find either of the two buttons, so assume some kind of
  // loading state.
  return true;
}

// Returns true if pauseButton is there and we're not in the loading state.
function currentlyPlaying() {
  if (currentlyLoading()) {
    return false;
  }
  return document.querySelector(Selectors.pauseButton)? true: false;
}

// Returns true if playButton is there and we're not in the loading state.
function currentlyPaused() {
  if (currentlyLoading()) {
    return false;
  }
  return document.querySelector(Selectors.playButton)? true: false;
}

function getCurrentTitle() {
  const el = document.querySelector(Selectors.currentTitle);
  return el? el.textContent: null;
}

// Returns a value in milliseconds.
function getCurrentSongProgress() {
  const button = document.querySelector(Selectors.sliderBar + " button");
  const percentageString = button.style.left;
  if (!percentageString.endsWith('%')) {
    return 0;
  }
  return parseFloat(percentageString.slice(0, -1));
}

function stopPlaying() {
  if (songProgressInterval !== null) {
    clearInterval(songProgressInterval);
  }
  if (currentlyPlaying()) {
    clickSelector(Selectors.pauseButton);
  }
}

function checkSongProgress() {
  // If a song lasts 30 secs, 1% of it's duration is just 300ms, whereas our 
  // poll rate is 400ms.
  // On the other end, 3min songs will be cut off by ~2secs because of this.
  // I'm fine with that, song ends are never reached in practice.
  // TODO test that this works for short songs, maybe it will linger on 100
  // enough for us to pick up the change.
  if (getCurrentSongProgress() > 99) {
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
    console.log('click failed');
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
  let i;
  for (i = 0; i < 2; ++i) {
    if (!clickSelector(Selectors.nextButton, messages.type.moveToNextSong)) {
      return;
    }

    let s = new Set();
    let j;
    for (j = 0; j < 50; ++j) {
      s.add(getCurrentSongProgress());
      await sleep(50);
      console.log(s.size);
      if (s.size > 3) {
        break;
      }
    }
    if (j < 50) {
      break;
    }
  }
  if (i < 2) {
    if (!clickSelector(Selectors.pauseButton, messages.type.moveToNextSong)) {
      return;
    }
  } else {
    console.log('i=2');
    sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
    return;
  }

  console.log(getCurrentTitle());

  // Wait for the indicator to become paused.
  for (i = 0; i < 20; ++i) {
    console.log('waiting for pause:', i);
    await sleep(100);
    if (currentlyPaused()) break;
  }
  if (i == 20) {
    sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
    return;
  }

  sendTitle();
}

async function startPlaying() {
  console.log('at startPlaying', currentlyPlaying(), currentlyPaused());
  if (!currentlyPaused()) {
    console.log('SHOULD NEVER HAPPEN');
    sendError(messages.type.startPlaying, messages.status.failedToStartPlaying);
    return false;
  }

  // The playButton is always present if currentlyPaused returned true.
  clickSelector(Selectors.playButton, messages.type.startPlaying);
  chrome.runtime.sendMessage(messages.newMessage(messages.type.startPlaying));
}

chrome.runtime.onMessage.addListener(function(message) {
  console.log('got message:', message);

  const messageType = messages.getType(message);

  if (messageType == messages.type.moveToNextSong) {
    if (songProgressInterval !== null) {
      clearInterval(songProgressInterval);
      songProgressInterval = null;
    }

    clickNextAndSendTitle();
  } else if (messageType == messages.type.startPlaying) {
    // This assumes moveToNextSong was called beforehand.
    // It makes sense, because you can't know the title that's about to play
    // unless you previously called moveToNextSong.
    if (startPlaying()) {
      songProgressInterval = setInterval(checkSongProgress, SONG_PROGRESS_POLL_RATE);
    }
  } else if (messageType == messages.type.detachRoom) {
//    startPlaying();
    console.log('got detach room message');
    stopPlaying();
  }
});
