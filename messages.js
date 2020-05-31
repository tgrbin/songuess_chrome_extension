const messages = {
  // Status is implied as OK.
  newMessage: function(type, data) {
    return {
      type: type,
      data: data,
      status: messages.status.ok
    };
  },

  // Data is optional, can contain for example an error message.
  newError: function(type, status, data) {
    return {
      type: type,
      status: status,
      data: data
    };
  },

  getType: function(message) {
    return message.type;
  },

  getData: function(message) {
    return message.data;
  },

  getStatus: function(message) {
    return message.status;
  },

  type: {
    moveToNextSong: 'moveToNextSong',
    startPlaying: 'startPlaying',
    attachToRoom: 'attachToRoom',
    detachRoom: 'detachRoom',
    isAttached: 'isAttached',
    startedStreaming: 'startedStreaming',
    songHasEnded: 'songHasEnded'
  },
  
  status: {
    ok: 'OK',
    selectorNotFound: 'SELECTOR_NOT_FOUND',
    titleNotFound: 'TITLE_NOT_FOUND',
    serverError: 'SERVER_ERROR',
    socketError: 'SOCKET_ERROR',
    failedToMoveToNextSong: 'FAILED_TO_NEXT',
    faliedToStartPlaying: 'FAILED_TO_PLAY'
  }
};
