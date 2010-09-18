// Presenter ------------------------------------------------------------------
function Presenter(mocklist, parent_node) {
  this.mocklist_ = mocklist;
  this.mocklist_.addListener(this.mockListListener.bind(this));

  this.node_ = createElement('div', 'presentation', parent_node);
  this.scene_ = createElement('div', 'scene', this.node_);

  // FF didn't like addEventListener, also brain dead.
  window.onresize = this.layout.bind(this);
  document.onkeydown = this.keyDown.bind(this);
  this.mock_nodes_ = [];
}

Presenter.SPACING = 250;
Presenter.SELECTED_OVERLAP = 50;
Presenter.SMALL_WIDTH = 240;
Presenter.SMALL_HEIGHT = 240;
Presenter.MIN_EDGE_SPACING = 35;

Presenter.scale = function(node, scale) {
  if (BrowserDetect.browser == "Explorer" && BrowserDetect.version <= 8) {
    if (node.natural_width) {
      node.width = parseInt(node.natural_width * scale);
      node.height = parseInt(node.natural_height * scale);
      node.style.left = -node.width / 2;
      node.style.top = -node.height / 2;
    }
    return;
  }
  node.style.webkitTransform = 'scale('+scale+')';
  node.style.MozTransform = 'scale('+scale+')';
}

Presenter.opacity = function(node, opacity) {
  if (BrowserDetect.browser == "Explorer" && BrowserDetect.version <= 8) {
    // haxhaxhax
    var blurString = 'alpha(opacity=' + parseInt(opacity * 100) + ')';
    if (node.className == 'thumb') {
      node.style.filter = blurString + ' progid:DXImageTransform.Microsoft.Blur(pixelradius=7)';
    } else {
      node.style.filter = blurString;
    }
    return;
  }
  node.style.opacity = opacity;
  node.style.pointerEvents = (opacity == 0) ? 'none' : 'auto';
}

Presenter.prototype.mockListListener = function(e) {
  if (e.type == MockList.EVENT_ALLMOCKSLOADED) {
    window.console.log("all mocks loaded");
    this.orderNodes_();
  } else if (e.type == MockList.EVENT_SELECTION) {
    this.layout();
  } else if (e.type == MockList.EVENT_REORDER) {
    this.orderNodes_();
  } else if (e.type == MockList.EVENT_DELETION) {
    this.orderNodes_();
  } else if (e.type == MockList.EVENT_MOCKLOADED) {
    // Experimental.
    this.orderNodes_();
  } else if (e.type == MockList.EVENT_DELETED) {
    this.scene_.style.top = 50;
    this.scene_.style.opacity = 0;
  }
}

Presenter.prototype.createNode_ = function(mock) {
  // This probably causes layout.
  var cx = this.node_.offsetWidth / 2;
  var cy = this.node_.offsetHeight / 2 - Presenter.MIN_EDGE_SPACING / 2;
  
  var mock_node = createElement('div', 'mocknode');
  addEventListener(mock_node, 'click', this.imageClicked_.bind(this, mock));
  mock_node.mock = mock;
  mock_node.style.top = cy;
  mock_node.style.left = cx;

  //mock_node.image = createElement('img', 'image', mock_node);
  //mock_node.image.src = mock.image.src;
  mock_node.image = mock.image;
  mock_node.image.className = 'image';
  mock_node.appendChild(mock_node.image);

  mock_node.image.natural_width = mock.image.width;
  mock_node.image.natural_height = mock.image.height;
  mock_node.image.style.top = -parseInt(mock.image.height / 2);
  mock_node.image.style.left = -parseInt(mock.image.width / 2);
  Presenter.scale(mock_node.image, 0.1);
  Presenter.opacity(mock_node.image, 0);

  //mock_node.thumb = createElement('img', 'thumb', mock_node);
  //mock_node.thumb.src = mock.thumb.src;
  mock_node.thumb = mock.thumb;
  mock_node.thumb.className = 'thumb';
  mock_node.appendChild(mock_node.thumb);
  
  mock_node.thumb.natural_width = mock.thumb.width;
  mock_node.thumb.natural_height = mock.thumb.height;
  mock_node.thumb.width = mock.thumb.width;
  mock_node.thumb.height = mock.thumb.height;
  mock_node.thumb.style.top = -parseInt(mock.thumb.height / 2);
  mock_node.thumb.style.left = -parseInt(mock.thumb.width / 2);
  Presenter.scale(mock_node.thumb, 0.1);
  Presenter.opacity(mock_node.thumb, 0);

  return mock_node;
}

/**
 * Creates a node if it doesn't already exist.
 */
Presenter.prototype.getNodeForMock_ = function(mock) {
  for (var u = 0, mock_node; mock_node = this.mock_nodes_[u]; u++) {
    if (mock_node.mock == mock) {
      return mock_node;
    }
  }

  return this.createNode_(mock);
}

Presenter.prototype.orderNodes_ = function() {
  var mocks = this.mocklist_.getMocks();
  if (!mocks) { return }

  // If there has been a deletion.
  for (var i = 0, node; node = this.mock_nodes_[i]; i++) {
    node.processed = false;
  }

  var new_mock_nodes = [];
  for (var i = 0, mock; mock = mocks[i]; i++) {
    if (!mock.loaded) continue;

    // Find or create our node.
    var mock_node = this.getNodeForMock_(mock);
    mock_node.processed = true;
    this.scene_.appendChild(mock_node);
    new_mock_nodes.push(mock_node);
  }

  // Find untouched nodes-they must have been deleted.
  if (new_mock_nodes.length != this.mock_nodes_.length) {
    for (var i = 0, node; node = this.mock_nodes_[i]; i++) {
      if (node.processed == false) {
        this.scene_.removeChild(node);
        delete node;
      }
    }
  }

  this.mock_nodes_ = new_mock_nodes;
  this.layout();
}

Presenter.prototype.layout = function() {
  var selected = this.mocklist_.getSelected();
  var cx = this.node_.offsetWidth / 2;
  var cy = this.node_.offsetHeight / 2 - Presenter.MIN_EDGE_SPACING / 2;
  var max_width = this.node_.offsetWidth - Presenter.MIN_EDGE_SPACING * 2;
  var max_height = this.node_.offsetHeight - Presenter.MIN_EDGE_SPACING * 2;
  var x = 0;

  for (var i = 0, mock_node; mock_node = this.mock_nodes_[i]; i++) {    
    var mock = mock_node.mock;
    var full_width = mock.image.width;
    var full_height = mock.image.height;
    var thumb_width = mock.thumb.width;
    var thumb_height = mock.thumb.height;

    if (mock == selected) {

      x -= Presenter.SPACING / 2;
      x -= Presenter.SELECTED_OVERLAP;

      // Figure out the right size for the fullsize image.
      var scale = min(max_width / full_width, max_height / full_height);
      scale = (scale < 1) ? scale : 1;

      var width = full_width * scale;
      var height = full_height * scale;

      x += width / 2;
      // Position the mock.
      mock_node.style.left = x;
      mock_node.style.top = cy;

      mock_node.className = 'mocknode selected';
      Presenter.scale(mock_node.image, scale);
      Presenter.opacity(mock_node.image, 1);

      // Figure out the right size for the thumbnail.
      var thumb_scale = width / thumb_width;
      Presenter.scale(mock_node.thumb, thumb_scale);
      Presenter.opacity(mock_node.thumb, 0);

      this.scene_.style.left = cx - x;

      x += width / 2;
      x += Presenter.SPACING / 2;
      x -= Presenter.SELECTED_OVERLAP;
    } else {
      mock_node.style.top = cy;
      mock_node.style.left = x;
      mock_node.className = 'mocknode';

      // Figure out the size of the full image.
      var scale = min(Presenter.SMALL_WIDTH / full_width, Presenter.SMALL_HEIGHT / full_height);
      scale = (scale < 1) ? scale : 1;
      Presenter.scale(mock_node.image, scale);
      Presenter.opacity(mock_node.image, 0);

      // Figure out the size of the thumb image.
      var thumb_scale = min(Presenter.SMALL_WIDTH / thumb_width, Presenter.SMALL_HEIGHT / thumb_width);
      thumb_scale = (thumb_scale < 1) ? thumb_scale : 1;
      Presenter.scale(mock_node.thumb, thumb_scale);
      Presenter.opacity(mock_node.thumb, 0.5);

      x += Presenter.SPACING;
    }
  }
}

Presenter.prototype.keyDown = function(e) {
  if (window.event) e = window.event;
  switch (e.keyCode) {
    case 39:
    case 40:
      this.mocklist_.selectNext();
      break;
    case 37:
    case 38:
      this.mocklist_.selectPrev();
      break;
  }
}

Presenter.prototype.setZoom = function(zoom) {
  if (zoom) {
    this.zoom_ = true;
    this.node_.className = 'presentation zoomed';
  } else {
    this.zoom_ = false;
    this.node_.className = 'presentation';
  }
  this.layout();
}

Presenter.prototype.imageClicked_ = function(mock) {
  if (mock != this.mocklist_.getSelected()) {
    this.mocklist_.setSelected(mock);
    return;
  } else {
    if (window.event.offsetX > window.event.target.offsetWidth / 2) {
      this.mocklist_.selectNext();
    } else {
      this.mocklist_.selectPrev();
    }
  }
}

