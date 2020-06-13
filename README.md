# Songuess Chrome extension

The extension is used for hosting Songuess games.

The only currently supported streaming service is Google Play Music, but we can add more when someone asks for it.

## Installing

1. Download (or clone) this repository
2. Go to chrome://extensions, enable "Developer mode"
3. Click "Load unpacked" and choose the extension folder

## Create a room

Go to https://songuess.live/#SOME_NAME and create a room.

The rooms store more or less only the current scores, and they will be gone if the server is restarted.

So just pick any unused name for your game.

## Create a playlist

Got to your streaming service and create a playlist you want to play with.

## Start the game

The game is started by "attaching" to the created server room.

Note that it will refuse to attach if the room is currently empty, so make sure to open it (songuess.live/#SOME_NAME) in another tab first.

For Google Play Music, you probably want your playlist to shuffle, so click "Shuffle" (and then pause) before attaching, or have the shuffle icon enabled before attaching.

## Have fun playing! :)

---

## Issues

You can detach/attach if there are any problems, the game should continue normally.

If the server crashes, you'll have to contact me to restart manually.

We only tested the game in Chrome.
