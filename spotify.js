/*
 * This is a content script for hosting a game from Spotify.
 */

const Selectors = {
  playButton:
    ".Root__top-container button[data-testid='control-button-play']",
  pauseButton:
    ".Root__top-container button[data-testid='control-button-pause']",
  prevButton: 
    ".Root__top-container button[data-testid='control-button-skip-back']",
  nextButton: 
    ".Root__top-container button[data-testid='control-button-skip-forward']",
  currentTitle: ".Root__now-playing-bar a[data-testid='nowplaying-track-link']",
  sliderBar: ".Root__top-container .playback-bar .progress-bar__bg"
};

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
  // TODO: Test that this works for short songs, maybe it will linger on 100
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

function sendTitle(title) {
  // Message type we're sending from here is always moveToNextSong.
  // That's the message that triggered searching for a title, and
  // when the search is done we send the same type of message back.
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

function checkIfTheBarMoved(s) {
  // It works by collecting values from the progress bar, returning true
  // as soon as 4 different values are present.
  // Sometimes the bar returns the same value twice, sometimes it changes a bit
  // right after you press "next", and then starts changing for real later.
  // So 4 was a good value to wait for.
  s.add(getCurrentSongProgress());
  if (s.size > 3) {
    return true;
  }
  return false;
}

async function clickNextAndSendTitle() {
  console.log('clicking next and waiting for bar to move');

  // State here is that some song is either playing or paused.
  // We start by hitting next, which will move to the next one AND
  // start playing it right away.
  let i, j, s;
  for (i = 0; i < 2; ++i) {
    if (!clickSelector(Selectors.nextButton, messages.type.moveToNextSong)) {
      return;
    }
    s = new Set();
    for (j = 0; j < 50; ++j) {
      if (checkIfTheBarMoved(s)) {
        break;
      }
      await sleep(50);
    }
    if (j < 50) {
      break;
    }
  }
  if (i == 2) {
    console.log('i=2');
    sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
    return;
  }

  // At this point, the next song is playing.
  // But, we can't pause it here and return, because a tiny part of audio would
  // still be cut off.
  // We have to position it directly at 0.
  const nextTitle = getCurrentTitle();
  console.log('next title:', nextTitle);

  console.log('clicking prev and waiting for bar to move');
  // So we hit "prev song" button, wait for progress to move, and then pause it.
  if (!clickSelector(Selectors.prevButton, messages.type.moveToNextSong)) {
    return;
  }

  s = new Set();
  for (j = 0; j < 50; ++j) {
    if (checkIfTheBarMoved(s)) {
      break;
    }
    await sleep(50);
  }
  if (j == 50) {
    console.log('progress bar didn\'t start moving after hitting prev');
    sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
    return;
  }

  console.log('clicking pause');
  // We now pause the song.
  if (!clickSelector(Selectors.pauseButton, messages.type.moveToNextSong)) {
    return;
  }

  // And wait for the pause to take effect.
  for (i = 0; i < 10; ++i) {
    console.log('waiting for pause:', i);
    await sleep(100);
    if (currentlyPaused()) break;
  }
  if (i == 10) {
    sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
    return;
  }

  console.log('pause took effect');

  // We end this function actually positioned at the CURRENTLY playing song.
  // But we know what the next one will be, because we've 'peeked' there.
  // The startPlaying call will hit nextButton to start the next song.
  sendTitle(nextTitle);
}

async function startPlaying() {
  console.log('at startPlaying', currentlyPlaying(), currentlyPaused());
  if (!currentlyPaused()) {
    console.log('SHOULD NEVER HAPPEN');
    sendError(messages.type.startPlaying, messages.status.failedToStartPlaying);
    return false;
  }

  clickSelector(Selectors.nextButton, messages.type.startPlaying);
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
    console.log('got detach room message');
    stopPlaying();
  }
});
