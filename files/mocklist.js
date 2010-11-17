// MockList -------------------------------------------------------------------
/**
 * This contains all the data for the current set of mocks. It's responsible
 * for syncing the mock data up to the cloud.
 */
function MockList(id, key, name) {
  this.name = name ? name : 'Untitled';
  this.description = '';

  this.mocks_ = [];
  this.loading_queue_ = [];

  this.selected_ = null;
  this.listeners_ = [];
  // A public identifier unique to this mocklist.
  this.id = id;

  // A private key used to allow modification of this mocklist.
  this.key = key;
}

// static
MockList.isImage = function(file) {
  switch (file.type) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
      return true;
    default: 
      return false;
  }
}

MockList.EVENT_NEWMOCK = 1;
MockList.EVENT_MOCKLOADED = 2;
MockList.EVENT_SELECTION = 3;
MockList.EVENT_ALLMOCKSLOADED = 4;
MockList.EVENT_REORDER = 5;
MockList.EVENT_MOCKSDROPPED = 6;
MockList.EVENT_SAVEDID = 7;
MockList.EVENT_SAVED = 8;
MockList.EVENT_ERRORS = 9;
MockList.EVENT_NAMECHANGED = 10;
MockList.EVENT_DELETING = 11;
MockList.EVENT_DELETED = 12;
MockList.EVENT_DELETEFAILED = 13;

MockList.REORDER_BEFORE = 21;
MockList.REORDER_AFTER = 22;

MockList.URL_GETID = '/api/getid/';
MockList.URL_FILE_UPLOAD = '/api/savemock/';
MockList.URL_FILE_DELETE = '/api/deletemock/';
MockList.URL_SAVE = '/api/savemocklist/';
MockList.URL_MOCK = '/i'; // no trailing slash
MockList.URL_VIEWER_BASE = '/m'; // no trailing slash
MockList.URL_DELETE_MOCKLIST = '/api/deletemocklist/';
MockList.URL_MANUAL_UPLOAD = '/api/manualupload/';

MockList.prototype.addListener = function(listener) {
  this.listeners_.push(listener);
}

MockList.prototype.callListeners_ = function(e) {
  for (var i = 0, func; func = this.listeners_[i]; i++) {
    func(e);
  }
}

MockList.prototype.getMocks = function() {
  return this.mocks_;
}

MockList.prototype.setSelected = function(mock) {
  this.selected_ = mock;
  this.callListeners_({
    type : MockList.EVENT_SELECTION,
    data : mock
  });
}

MockList.prototype.selectNext = function() {
  // -1 is to prevent overflow errors - if the selection is at the end,
  // there's no point going further (wrapping dooooom).
  for (var i = 0; i < this.mocks_.length - 1; i++) {
    if (this.mocks_[i] == this.selected_) {
      this.setSelected(this.mocks_[i + 1]);
      return;
    }
  }
}

MockList.prototype.selectPrev = function() {
  // i = 1 is to prevent overflow errors.
  for (var i = 1; i < this.mocks_.length; i++) {
    if (this.mocks_[i] == this.selected_) {
      this.setSelected(this.mocks_[i - 1]);
      return;
    }
  }
  this.setSelected(this.mocks_[0]);
}

MockList.prototype.getSelected = function() {
  if (!this.selected_) this.selected_ = this.mocks_[0];
  return this.selected_;
}

MockList.prototype.setName = function(name) {
  this.name = name;
  this.save();
  this.callListeners_({
    type : MockList.EVENT_NAMECHANGED,
    data : name
  });
}

MockList.prototype.deleteMock = function(to_delete) {
  var new_mocks = [];
  for (var i = 0, mock; mock = this.mocks_[i]; i++) {
    if (mock != to_delete)
      new_mocks.push(mock);
  }
  this.mocks_ = new_mocks;
  if (this.selected_ == to_delete)
    this.selectPrev();

  to_delete.deleteMock();

  this.save();

  this.callListeners_({
    type : MockList.EVENT_DELETION
  });
}

MockList.prototype.mocksFromJSON = function(mocks) {
  window.console.log("Importing mock IDs...");
  for (var i = 0, data; data = mocks[i]; i++) {
    var mock = new Mock(this);
    mock.setID(data.id);
    mock.setName(data.name);
    this.mocks_.push(mock);
    mock.addListener(this.mockListener.bind(this));
    this.loading_queue_.push(mock);
    this.callListeners_({
      type : MockList.EVENT_NEWMOCK,
      data : mock
    });
  }
  if (this.loading_queue_.length) {
    this.processQueue_();
  } else {
    setTimeout(this.callAllMocksLoaded_.bind(this), 50);
  }
}

MockList.prototype.newLocalFiles = function(files, dropmock, order) {
  // Try to get a fresh ID and key from the server.
  this.getID_();

  this.callListeners_({
    type : MockList.EVENT_MOCKSDROPPED
  });

  var errors = [];
  var new_mocks = [];

  // Verify that they're images and add the files.
  for (var i = 0, file; file = files[i]; i++) {
    if (MockList.isImage(file) && file.size < 900000) {
      var mock = new Mock(this);
      mock.setFile(file);
      new_mocks.push(mock);
      mock.addListener(this.mockListener.bind(this));
    } else {
      var error = '';
      if (!MockList.isImage(file))
        error = "not an image";
      else if (file.size >= 900000)
        error = "exceeds 900KB";
      errors.push(file.name + ' (' + error + ')');
    }
  }

  // If the files have been dropped into the list, 
  // insert them properly.
  if (dropmock && order) {
    window.console.log('finding position');
    var position = 0;
    for (var i = 0, mock; mock = this.mocks_[i]; i++) {
      if (mock == dropmock) {
        position = (order == MockList.REORDER_AFTER) ? i + 1 : i;
        break;
      }
    }
    window.console.log('inserting at position ' + i);
    for (var i = 0, mock; mock = new_mocks[i]; i++) {
      this.mocks_.splice(position + i, 0, mock);
    }
  } else {
    this.mocks_ = this.mocks_.concat(new_mocks);
  }

  // Add the mockups to the loading queue, and let people
  // know they've been created.
  for (var i = 0, mock; mock = new_mocks[i]; i++) {
    this.loading_queue_.push(mock);
    this.callListeners_({
      type : MockList.EVENT_NEWMOCK,
      data : mock
    });
  }
  if (this.loading_queue_.length)
    this.processQueue_();

  if (errors.length) {
    this.callListeners_({
      type : MockList.EVENT_ERRORS,
      errors : errors
    });
  }
}

/**
 * When using local files, sometimes things get hairy if we try to do
 * too many in parallel.
 */
MockList.prototype.processQueue_ = function() {
  this.loading_queue_.splice(0, 1)[0].load();
}

MockList.prototype.callAllMocksLoaded_ = function() {
  this.callListeners_({
    type : MockList.EVENT_ALLMOCKSLOADED
  });
}

/**
 * Called when a mock is loaded.
 */
MockList.prototype.mockListener = function(e) {
  if (e.type == Mock.EVENT_LOADED) {
    if (this.loading_queue_.length == 0) {
      this.callAllMocksLoaded_();
    } else {
      this.callListeners_({
        type : MockList.EVENT_MOCKLOADED,
        data : e.data
      });
      this.processQueue_();
    }
  } else if (e.type == Mock.EVENT_UPLOADED) {
    // This will succeed when all mocks have been uploaded.
    this.save();
  }
}

MockList.prototype.reorder = function(newmock, relative, ordering) {
  var newmocks = [];
  for (var i = 0, mock; mock = this.mocks_[i]; i++) {
    if (mock == newmock) continue;
    if (mock == relative) {
      if (ordering == MockList.REORDER_BEFORE) {
        newmocks.push(newmock);
        newmocks.push(relative);
      } else {
        newmocks.push(relative);
        newmocks.push(newmock);
      }
    } else {
      newmocks.push(mock);
    }
  }
  this.mocks_ = newmocks;

  this.callListeners_({
    type : MockList.EVENT_REORDER,
    data : newmock
  });

  this.save();
}

// SAVING AND LOADING
MockList.fromJSON = function(data) {
  var mocklist = new MockList(data.id, data.key, data.name);
  mocklist.mocksFromJSON(data.mocks);
  return mocklist;
}

MockList.prototype.save = function() {
  if (this.id && !this.key) {
    window.console.log("No permission to save this mocklist");
    return;
  }

  // Check to see if we have the id and key, which are required to
  // save any more details.
  if (!this.id && !this.key) {
    window.console.log("No id or key details");
    this.getID_();
    return;
  }

  // Check that all our mocks have ids; if they haven't,
  // abort. When they get their IDs, their EVENT_UPLOADED will
  // trigger another save attempt.
  var mock_ids = [];
  for (var i = 0, mock; mock = this.mocks_[i]; i++) {
    if (!mock.id) {
      window.console.log("Not all mocks have been uploaded");
      return;
    }
    mock_ids.push(mock.id);
  }

  var data = JSON.stringify({
    name : this.name,
    id : this.id,
    key : this.key,
    mocks : mock_ids
  });

  window.console.log("Submitting save: " + data);
  var req = new XMLHttpRequest();
  req.open('POST', MockList.URL_SAVE, true);
  req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  req.onreadystatechange = this.saveListener_.bind(this, req);
  req.send(data);
}

MockList.prototype.saveListener_ = function(req) {
  if (req.readyState == 4 && req.status == 200) {
    window.console.log('Saved: ' + this.id);
    this.callListeners_({
      type : MockList.EVENT_SAVED
    });
  }
}

MockList.prototype.getID_ = function() {
  if (this.id) return;

  var req = new XMLHttpRequest();
  req.open('GET', MockList.URL_GETID, true);
  req.onreadystatechange = this.getIDListener_.bind(this, req);
  req.send(null);
}

MockList.prototype.getIDListener_ = function(req) {
  if (req.readyState == 4 && req.status == 200) {
    var data = JSON.parse(req.responseText);
    if (data && data.id && data.key) {
      this.id = data.id;
      this.key = data.key;

      this.callListeners_({
        type : MockList.EVENT_SAVEDID,
        id : this.id,
        key : this.key
      });
    } else {
      window.console.log('Save error: ' + req.responseText);
    }
  }
}

MockList.prototype.deleteMockList = function(e) {
  if (this.id && !this.key) {
    window.console.log("No permission to delete this mocklist");
    return;
  }
  this.callListeners_({
    type : MockList.EVENT_DELETING
  });
  var req = new XMLHttpRequest();
  req.open('GET', MockList.URL_DELETE_MOCKLIST + '?id=' + this.id + '&key=' + this.key, true);
  req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  req.onreadystatechange = this.deleteListener_.bind(this, req);
  req.send();
}

MockList.prototype.deleteListener_ = function(req) {
  if (req.readyState == 4 && req.status == 200) {
    window.console.log('response:' + req.responseText);
    var data = JSON.parse(req.responseText);
    if (data.success) {
      this.callListeners_({type : MockList.EVENT_DELETED});
    } else {
      this.callListeners_({type : MockList.EVENT_DELETEFAILED});
    }
  }
}