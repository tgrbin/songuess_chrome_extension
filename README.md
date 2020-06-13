# Songuess Chrome extension

The extension is used for hosting Songuess games.

The only currently supported streaming service is Google Play Music, but we can add more when someone asks for it.

## Installing

1. [Download](https://github.com/tgrbin/songuess_chrome_extension/archive/master.zip) (or clone) the extension
2. Unzip it
3. Go to chrome://extensions, enable "Developer mode"
4. Click "Load unpacked" and choose the extension folder

## Create a room

Pick a name for your room, and then go to https://songuess.live/#YOUR_NAME_HERE and create a room.

If the room exists (i.e. the create room interface doesn't appear), just pick another name.

## Create a playlist

Go to your streaming service web page and create a playlist you want to host a game with.

## Start the game

The game is started by "attaching" to the created server room. From the streaming service page, click on the extension icon (upper right, could be hidden), type the room name and click "Attach".

It will refuse to attach if the room is currently empty, so make sure to open it (songuess.live/#YOUR_NAME_HERE) in another tab first.

For Google Play Music, you probably want your playlist to shuffle, so click "Shuffle" (and then pause) before attaching, or have the shuffle icon enabled before attaching.

## Have fun playing! :)

---

## Issues

You can detach/attach if there are any problems, the game should continue normally.

If the server crashes, you'll have to contact me to restart manually.

We only tested the game in Chrome.
