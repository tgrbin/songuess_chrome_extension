/*
 * This is a content script for hosting a game from Spotify.
 */

const Selectors = {
  pauseButton: "div.Root__now-playing-bar button[title='Pause']",
  nextButton: "div.Root__now-playing-bar div.player-controls__buttons button:nth-of-type(4)",
  currentTitle: "div.Root__now-playing-bar a[data-testid='nowplaying-track-link']",
  currentArtist: "div.Root__now-playing-bar a[href^='/artist/']",
  sliderBar: "div.Root__top-container div.playback-bar div.progress-bar__bg"
};

// Poll rate for the song progress slider, used to detect that the song ended.
const SONG_PROGRESS_POLL_RATE = 400;

let songProgressInterval = null;

console.log('hi from content script: ', document.URL);

function getCurrentTitle() {
  const el = document.querySelector(Selectors.currentTitle);
  return el? el.textContent: null;
}

function getCurrentArtist() {
  const el = document.querySelector(Selectors.currentArtist);
  return el? el.textContent: null;
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
  console.log('stop playing called');
  if (songProgressInterval !== null) {
    console.log('progress interval wasnt null');
    clearInterval(songProgressInterval);
    songProgressInterval = null;
  }
  clickSelector(Selectors.pauseButton);
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

function sendCurrentSong() {
  const title = getCurrentTitle();
  const artist = getCurrentArtist();
  console.log('current song: ', title, ' ', artist);
  if (title !== null) {
    chrome.runtime.sendMessage(messages.newMessage(
      messages.type.startPlaying, {title: title, artist: artist})
    );
  } else {
    sendError(messages.type.startPlaying, messages.status.titleNotFound);
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

async function clickNextAndSendCurrentSong() {
  console.log('clicking next and waiting for bar to move');
  // We start by clicking next, which will move to the next one AND
  // start playing it right away.
  let i, j, s;
  // We try this twice, in case the first click didn't take.
  for (i = 0; i < 2; ++i) {
    if (!clickSelector(Selectors.nextButton, messages.type.startPlaying)) {
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
    sendError(messages.type.startPlaying, messages.status.failedToStartPlaying);
    return;
  }

  // At this point, the next song is playing, we get the current title/artist
  // and send it back.
  sendCurrentSong();

  // Start the interval timer for checking if the song is done.
  songProgressInterval = setInterval(checkSongProgress, SONG_PROGRESS_POLL_RATE);
}

async function stopAndSendMoveOk() {
  stopPlaying();
  // Without this small delay, a very short part of the previous song will be
  // heard when the next song is starting, causing a noise-like blip at the
  // beginning.
  await sleep(200);
  chrome.runtime.sendMessage(messages.newMessage(messages.type.moveToNextSong));
}

chrome.runtime.onMessage.addListener(function(message) {
  console.log('got message:', message);

  const messageType = messages.getType(message);

  if (messageType == messages.type.moveToNextSong) {
    // We'll just stop the current song (if any) and return.
    // The following startPlaying message will actually click next to start
    // playing the next song, plus send the current item back.
    stopAndSendMoveOk();
  } else if (messageType == messages.type.startPlaying) {
    clickNextAndSendCurrentSong();
  } else if (messageType == messages.type.detachRoom) {
    stopPlaying();
  }
});
