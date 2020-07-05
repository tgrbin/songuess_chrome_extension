/*
 * This is a content script for hosting a game from Youtube Music.
 */

const Selectors = {
  startPlaylistButton: "paper-button[aria-label='Shuffle']",
  startPlaylistButtonBackup: "paper-button[aria-label='PLAY ALL']",
  playPauseButton: '#play-pause-button',
  prevButton: 'paper-icon-button.previous-button',
  nextButton: 'paper-icon-button.next-button',
  currentTitle: 'div.content-info-wrapper .title',
  currentArtist: 'div.content-info-wrapper .byline-wrapper a:nth-child(1)',
  sliderBar: '#progress-bar #primaryProgress'
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
  const title = getCurrentTitle();
  const ready = (title && title.length > 0)? true: false;
  console.log('play bar ready:', ready);
  return ready;
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

function getCurrentArtist() {
  const el = document.querySelector(Selectors.currentArtist);
  return el? el.textContent: null;
}

// Returns a value in milliseconds.
function getCurrentSongProgress() {
  const el = document.querySelector(Selectors.sliderBar);
  const transform = el.style.transform;  // Example value: 'scaleX(0.0616114)'
  const arr = transform.match(/scaleX\((.*)\)/);
  if (!arr || arr.length != 2) {
    return 0;
  }
  return (parseFloat(arr[1]) || 0) * 100;
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
    if (messageType) {
      sendError(messageType, messages.status.selectorNotFound);
    }
    return false;
  }
}

function sendCurrentItem(title, artist) {
  console.log('sending item:', title, artist);
  // Message type we're sending from here is always moveToNextSong.
  // That's the message that triggered searching for a title, and
  // when the search is done we send the same type of message back.
  if (title !== null) {
    chrome.runtime.sendMessage(messages.newMessage(
      messages.type.moveToNextSong, {
        title: title,
        artist: artist
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
  let newTitle = null;
  let newArtist = null;

  // Click next.
  if (!clickSelector(Selectors.nextButton, messages.type.moveToNextSong)) {
    return;
  }

  // Wait for it to start playing.
  for (let i = 0; i < NEXT_STATE_MAX_ITERATIONS; ++i) {
    await sleep(NEXT_STATE_POLL_RATE);
    if (getCurrentTitle() !== oldTitle && currentlyPlaying()) {
      // It's playing and we have a new title.
      // At this point we store the new title, and go back to the previous song.
      // The reason is it's impossible to pause right after the song starts
      // playing.
      // So we 'peek' the next song, go back, pause, and then the following
      // 'play' command from the server will actually click 'next'.
      newTitle = getCurrentTitle();
      newArtist = getCurrentArtist();
      if (!clickSelector(Selectors.prevButton, messages.type.moveToNextSong)) {
        return;
      }
      // Wait for the going to previous song to take effect.
      for (let j = 0; j < NEXT_STATE_MAX_ITERATIONS; ++j) {
        console.log('waiting j:', j);
        await sleep(NEXT_STATE_POLL_RATE);
        // Keep waiting, title is still the same.
        if (getCurrentTitle() === newTitle) {
          continue;
        }
        // Keep clicking pause until it takes effect.
        if (currentlyPlaying()) {
          // Pause the previous song.
          if (!clickSelector(Selectors.playPauseButton, messages.type.moveToNextSong)) {
            return;
          }
          continue;
        }
        // We're done, title is old and the song is paused.
        sendCurrentItem(newTitle, newArtist);
        return;
      }
    }
  }

  sendError(messages.type.moveToNextSong, messages.status.failedToMoveToNextSong);
}

async function initialStartPlaylist() {
  // Click shuffle or play.
  if (!clickSelector(Selectors.startPlaylistButton) &&
      !clickSelector(Selectors.startPlaylistButtonBackup, messages.type.moveToNextSong)) {
    return;
  }

  // Wait for it to start playing, then click pause.
  for (let i = 0; i < NEXT_STATE_MAX_ITERATIONS; ++i) {
    await sleep(NEXT_STATE_POLL_RATE);
    if (getCurrentTitle() !== null && currentlyPlaying()) {
      if (!clickSelector(Selectors.playPauseButton, messages.type.moveToNextSong)) {
        break;
      }
      await sleep(AFTER_PAUSE_DELAY);
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

  if (!clickSelector(Selectors.nextButton, messages.type.startPlaying)) {
    sendError(messages.type.startPlaying, messages.status.failedToStartPlaying);
    return false;
  }

  chrome.runtime.sendMessage(messages.newMessage(messages.type.startPlaying));
  return true;
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
      clickNextAndSendTitle();
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
