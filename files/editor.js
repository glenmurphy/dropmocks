// Editor ----------------------------------------------------------------
function Editor(mocklist) { 
  this.mocklist_ = mocklist;
  this.mocklist_.addListener(this.mockListListener.bind(this));
  this.mock_nodes_ = [];

  this.node_ = createElement('div', 'dm-editor', document.body);
  this.node_title_ = createElement('div', 'title', this.node_);
  this.node_name_ = createElement('div', 'listname', this.node_title_);
  this.updateName_();

  var delete_button = createElement('div', 'delete', this.node_title_);
  addEventListener(delete_button, 'click', this.titleDeleteClicked_.bind(this));

  addEventListener(this.node_name_, 'click', this.nameClicked_.bind(this));
  this.node_body_ = createElement('div', 'body', this.node_);
  this.node_filelist_ = createElement('div', 'filelist', this.node_body_);

  this.node_insert_ = createElement('div', 'insert-indicator', this.node_);

  // Sometimes we have to do things (such as get a mocklist id and key)
  // before we can send the file.
  this.manual_submit_queue_ = [];

  // For old browsers, we have a manual upload control. It makes me cry.
  if (false && BrowserDetect.browser == "Safari" && BrowserDetect.version <= 5) {
    this.node_manual_form_ = createElement('form', (BrowserDetect.browser == 'Safari') ? 'manual-safari' : 'manual', this.node_body_);
    this.node_manual_form_.method = 'POST';
    this.node_manual_form_.enctype = 'multipart/form-data';
    this.node_manual_form_.action = MockList.URL_MANUAL_UPLOAD;
    this.node_manual_form_.target = 'image_iframe';

    this.node_manual_field_ = createElement('input', '', this.node_manual_form_);
    this.node_manual_field_.type = 'file';
    this.node_manual_field_.name = 'image';
    addEventListener(this.node_manual_field_, 'change',
        this.manualFileChanged.bind(this, 
                                    this.node_manual_form_,
                                    this.node_manual_field_));
  }

  this.node_status_ = createElement('div', 'dm-editor-status hidden', document.body);
  
  addEventListener(document.body, 'dragover', this.dragOver_.bind(this));
  addEventListener(document.body, 'dragenter', this.dragEnter_.bind(this));
  addEventListener(document.body, 'dragleave', this.dragLeave_.bind(this));
  addEventListener(document.body, 'drop', this.fileDropped.bind(this)); 

  this.dragging_ = false;
  this.mousemovehandler_ = this.mousemove_.bind(this);
  this.mouseuphandler_ = this.mouseup_.bind(this);

  addEventListener(document.body, 'mousemove', this.mousemovehandler_);

  // If we're loading into a mocklist that already has data in it, prepare
  // our UI.
  this.reorder();
  if (this.mocklist_.id) {
    this.showAccessURL_(MockList.URL_VIEWER_BASE + this.mocklist_.id);
  }
}

Editor.prototype.manualFileChanged = function(form, filenode) {
  if (this.mocklist_.id && this.mocklist_.key) {
    form.submit();
    form.reset();
  } else {
    this.mocklist_.get_id();
    this.manual_submit_queue_.push(form);
  }
}

// static
Editor.cancelEvent = function(e) {
  e.stopPropagation();
  e.preventDefault();
}

Editor.prototype.setStatus = function(text) {
  if (text) {
    this.node_status_.style.opacity = 1;
    this.node_status_.style.bottom = 25;
    setText(this.node_status_, text);
  } else {
    this.node_status_.style.opacity = 0;
    this.node_status_.style.bottom = 5;
  }
}

Editor.prototype.updateName_ = function() {
  setText(this.node_name_, (this.mocklist_.name) ? this.mocklist_.name : 'Untitled');
}

Editor.prototype.mockListListener = function(e) {
  if (e.type == MockList.EVENT_NEWMOCK) {
    this.setStatus('Saving...');
    this.reorder();
  } else if (e.type == MockList.EVENT_SELECTION) {
    this.layout();
  } else if (e.type == MockList.EVENT_REORDER || 
             e.type == MockList.EVENT_DELETION) {
    this.reorder();
  } else if (e.type == MockList.EVENT_ALLMOCKSLOADED) {
    this.node_.style.display = 'block';
  } else if (e.type == MockList.EVENT_NAMECHANGED) {
    this.updateName_();
  } else if (e.type == MockList.EVENT_SAVED) {
    this.setStatus();
  } else if (e.type == MockList.EVENT_DELETING) {
    this.setStatus("Deleting...");
  } else if (e.type == MockList.EVENT_DELETED) {
    this.setStatus("Deleted, returning home...");
    this.node_.style.top = -100;
    this.node_.style.opacity = 0;
    setTimeout(function() {window.location.href = '/'}, 150);
  } else if (e.type == MockList.EVENT_DELETEFAILED) {
    alert("There was an error while deleting.");
  } else if (e.type == MockList.EVENT_SAVEDID) {
    // If we have pending manual uploads, send them.
    if (this.manual_submit_queue_.length) {
      for (var i = 0, form; form = this.manual_submit_queue_[i]; i++) {
        form.submit();
        form.reset();
      }
      this.manual_submit_queue_ = [];
    }

    if (window.history.pushState)
      window.history.pushState({}, "", MockList.URL_VIEWER_BASE + e.id);

    this.showAccessURL_(MockList.URL_VIEWER_BASE + e.id);
  } else if (e.type == MockList.EVENT_ERRORS) {
    this.showErrors_(e.errors);
  }
}

Editor.prototype.createFile_ = function(mock) {
  mock.addListener(this.mockListener.bind(this));

  var file = createElement('div', 'file', this.node_filelist_);
  file.text_node = createElement('div', 'name', file);
  setText(file.text_node, 'Loading...');
  file.mock = mock;
  file.addEventListener('click', this.fileClicked_.bind(this, file), false);
  file.addEventListener('mousedown', this.fileMousedown_.bind(this, file), false);

  var delete_button = createElement('div', 'delete', file);
  delete_button.addEventListener('click', this.fileDeleteClicked_.bind(this, file), false);
  return file;  
}

Editor.prototype.getFileForMock_ = function(mock) {
  for (var i = 0, file; file = this.mock_nodes_[i]; i++) {
    if (file.mock == mock)
      return file;
  }
  return this.createFile_(mock);
}

Editor.prototype.reorder = function() {
  var mocks = this.mocklist_.getMocks();
  if (!mocks) { return }

  // If there has been a deletion.
  for (var i = 0, node; node = this.mock_nodes_[i]; i++) {
    node.processed = false;
  }

  var new_mock_nodes = [];
  for (var i = 0, mock; mock = mocks[i]; i++) {
    var node = this.getFileForMock_(mock)
    this.node_filelist_.appendChild(node);
    node.processed = true;
    new_mock_nodes.push(node);
  }

  // Find untouched nodes-they must have been deleted.
  if (new_mock_nodes.length != this.mock_nodes_.length) {
    for (var i = 0, node; node = this.mock_nodes_[i]; i++) {
      if (node.processed == false) {
        this.node_filelist_.removeChild(node);
        delete node;
      }
    }
  }

  this.mock_nodes_ = new_mock_nodes;
  this.layout();
}

Editor.prototype.mockListener = function(e) {
  var mock = e.data;
  if (e.type == Mock.EVENT_LOADED) {
    for (var i = 0, file; file = this.mock_nodes_[i]; i++) {
      if (file.mock == mock) {
        setText(file.text_node, mock.name);
      }
    }
  }
}

Editor.prototype.layout = function() {
  var mocks = this.mocklist_.getMocks();
  var selected = this.mocklist_.getSelected();
  for (var i = 0, file; file = this.mock_nodes_[i]; i++) {
    if (file.mock == selected) {
      file.className = 'file selected';
    } else {
      file.className = 'file';
    }
  }
}

Editor.prototype.fileMousedown_ = function(file) {
  window.console.log('filemousedown');
  this.dragging_ = file;
  document.body.addEventListener('mouseup', this.mouseuphandler_, false);

  window.event.stopPropagation();
  window.event.preventDefault();
}

Editor.prototype.fileClicked_ = function(file) {
  this.mocklist_.setSelected(file.mock);
  window.event.stopPropagation();
  window.event.preventDefault();
}

Editor.prototype.fileDeleteClicked_ = function(file) {
  this.mocklist_.deleteMock(file.mock);
  window.event.stopPropagation();
  window.event.preventDefault();
}

Editor.prototype.titleClicked_ = function(e) {
  if (this.node_.className == 'dm-editor') {
    this.node_.className = 'dm-editor collapsed';
  } else {
    this.node_.className = 'dm-editor';
  }
}

Editor.prototype.titleDeleteClicked_ = function(file) {
  if (confirm("Are you sure you want to delete this mocklist?")) {
    this.mocklist_.deleteMockList();
  }
  window.event.stopPropagation();
  window.event.preventDefault();
}

Editor.prototype.nameClicked_ = function(e) {
  var name = prompt("Enter a new name:", this.mocklist_.name);
  if (name)
    this.mocklist_.setName(name);
}

Editor.prototype.mousemove_ = function(e) {
  this.highlightDrop_(e);
}

Editor.prototype.dragEnter_ = function(e) {
  this.dragging_ = true;
  Editor.cancelEvent(e);
}

Editor.prototype.dragLeave_ = function(e) {
  this.dragging_ = false;
}

Editor.prototype.dragOver_ = function(e) {
  this.dragging_ = true;
  this.highlightDrop_(e);
  Editor.cancelEvent(e);
}

Editor.prototype.highlightDrop_ = function(e) {
  if (!this.dragging_) return;

  var drop = this.getDropPoint_(e);
  if (drop) {
    this.node_insert_.style.display = 'block';
    this.node_insert_.style.top = drop.file.offsetTop + ((drop.after) ? drop.file.offsetHeight : 0);
  } else {
    this.node_insert_.style.display = 'none';
  }
}

Editor.prototype.getDropPoint_ = function(e) {
  for (var i = 0, file; file = this.mock_nodes_[i]; i++) {
    if (e.target == file) {
      return {
        file : file,
        mock : file.mock,
        after : (event.offsetY > file.offsetHeight / 2)
      }
    }
  }
  return false;
}

Editor.prototype.mouseup_ = function(e) {
  if (!this.dragging_) { return; }
  if (this.dragging_ == e.target) { 
    this.cancelDrag_();
    return;
  }

  var drop = this.getDropPoint_(e);
  if (drop)
    this.mocklist_.reorder(this.dragging_.mock, drop.mock, drop.after ? MockList.REORDER_AFTER : MockList.REORDER_BEFORE);

  this.cancelDrag_();
}

Editor.prototype.cancelDrag_ = function() {
  this.dragging_ = false;
  this.node_insert_.style.display = 'none';
  document.body.removeEventListener('mouseup', this.mouseuphandler_, false);
}

Editor.prototype.fileDropped = function(e) {
  if (!isValidBrowser()) return;

  this.dragging_ = false;

  var data = e.dataTransfer;
  if (!data || !data.files.length) return;

  var drop = this.getDropPoint_(e);
  if (!drop) {
    this.mocklist_.newLocalFiles(data.files);
  } else {
    this.mocklist_.newLocalFiles(data.files, drop.mock, drop.after ? MockList.REORDER_AFTER : MockList.REORDER_BEFORE);
  }

  e.stopPropagation();
  e.preventDefault();
  this.cancelDrag_();
  return false;
}

Editor.prototype.showAccessURL_ = function(url) {
  if (!this.node_access_url_)
    this.node_access_url_ = createElement('div', 'access-url', this.node_body_);

  //var full_url = window.location.protocol + '//' + window.location.host + url
  var full_url = 'http://dropmocks.com' + url;
  this.node_access_url_.innerHTML = 'Share this URL: <a href="' + full_url + '">' + full_url + '</a>';
}

Editor.prototype.showErrors_ = function(errors) {
  window.console.log("File error.");
  var node = createElement('div', 'dm-editor-error', document.body);
  node.innerHTML += '<h1>Error</h1>';
  node.innerHTML += '<p>We were unable to upload the following files:</p>';
  node.innerHTML += '<ul>';
  for (var i = 0, error; error = errors[i]; i++) {
    node.innerHTML += '<li>' + error + '</li>';
  }
  node.innerHTML += '</ul>';

  var close = createElement('input', '', node);
  close.type = 'button';
  close.value = 'OK';
  addEventListener(close, 'click', function(e) {
    document.body.removeChild(node);
  });
}
