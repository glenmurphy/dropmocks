// Mock -----------------------------------------------------------------------
function Mock(mocklist) {
  this.image = document.createElement('img');
  this.thumb = document.createElement('img');
  this.thumb_attempts_ = 0;
  this.mocklist_ = mocklist;
  this.mocklist_.addListener(this.mockListListener_.bind(this));
  this.listeners_ = [];

  this.loaded = false;
  this.file_ = null;

  this.id = null;
  this.name = null;
  this.type = null;
  this.queue_delete_ = false;
}

Mock.EVENT_LOADED = 0;
Mock.EVENT_UPLOADED = 1;
Mock.EVENT_DELETED = 2;

Mock.unknownFileCount = 1;
Mock.generateUnknownFileName = function() {
  return 'file ' + Mock.unknownFileCount++;
}

Mock.blur = function(img, radius) {
  // From http://www.java2s.com/Code/Java/Advanced-Graphics/FastBlurDemo.htm.
  // We actually keep the unpremultiplied values as it gives a nice border
  // effect on the images.
  var windowSize = radius * 2 + 1;
  var radiusPlusOne = radius + 1;
  var width = img.width;
  var height = img.height;
  var sumAlpha;
  var sumRed;
  var sumGreen;
  var sumBlue;
  var nextPixelIndex, previousPixelIndex;

  var sumLookupTable = [];
  for (var i = 0; i < 256 * windowSize; i++) {
    sumLookupTable[i] = i / windowSize;
  }

  var indexLookupTable = [];
  if (radius < width) {
    for (var i = 0; i < radiusPlusOne; i++) {
      indexLookupTable[i] = i;
    }
  } else {
    for (var i = 0; i < width; i++) {
      indexLookupTable[i] = i;
    }
    for (var i = width; i < radiusPlusOne; i++) {
      indexLookupTable[i] = width - 1;
    }
  }

  var srcIndex = 0;
  var dstIndex;
  var srcPixels = img.data;
  var dstPixels = [];

  for (var u = 0; u < 4; u++) {
    for (var y = 0; y < height; y++) {
      sumAlpha = sumRed = sumGreen = sumBlue = 0;
      dstIndex = y;

      var index = srcIndex * 4;
      sumAlpha += radiusPlusOne * (srcPixels[index + 3]);
      sumRed   += radiusPlusOne * (srcPixels[index + 0]);
      sumGreen += radiusPlusOne * (srcPixels[index + 1]);
      sumBlue  += radiusPlusOne * (srcPixels[index + 2]);

      for (var i = 1; i <= radius; i++) {
        var index = (srcIndex + indexLookupTable[i]) * 4;
        sumAlpha += srcPixels[index + 3];
        sumRed   += srcPixels[index + 0];
        sumGreen += srcPixels[index + 1];
        sumBlue  += srcPixels[index + 2];
      }

      for  (var x = 0; x < width; x++) {
        dstPixels[dstIndex * 4 + 3] = sumLookupTable[sumAlpha];
        dstPixels[dstIndex * 4 + 0] = sumLookupTable[sumRed];
        dstPixels[dstIndex * 4 + 1] = sumLookupTable[sumGreen];
        dstPixels[dstIndex * 4 + 2] = sumLookupTable[sumBlue];

        dstIndex += height;

        var nextPixelIndex = x + radiusPlusOne;
        if (nextPixelIndex >= width) {
          nextPixelIndex = width - 1;
        }

        var previousPixelIndex = x - radius;
        if (previousPixelIndex < 0) {
          previousPixelIndex = 0;
        }

        var nextPixelIndex = (srcIndex + nextPixelIndex) * 4;
        var previousPixelIndex = (srcIndex + previousPixelIndex) * 4;

        sumAlpha += srcPixels[nextPixelIndex + 3];
        sumAlpha -= srcPixels[previousPixelIndex + 3];

        sumRed += srcPixels[nextPixelIndex + 0];
        sumRed -= srcPixels[previousPixelIndex + 0];

        sumGreen += srcPixels[nextPixelIndex + 1];
        sumGreen -= srcPixels[previousPixelIndex + 1];

        sumBlue += srcPixels[nextPixelIndex + 2];
        sumBlue -= srcPixels[previousPixelIndex + 2];
      }
      srcIndex = y * width;
    }

    for (var i = 0; i < img.data.length; i++) {
      srcPixels[i] = dstPixels[i];
    }
  }

  return img;
}

Mock.blurImage = function(image, amount, width, height) {
  // Firefox 3 fails at putImageData - I suspect the blur 
  // algorithm may be to blame, however (clamping dstPixels
  // causes all sorts of tomfoolery).
  if (isValidBrowser() && BrowserDetect.version >= 4) {
    // Create the canvas.
    var canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");

    // Place the image.
    var scale = min((width - amount * 4) / image.width, (height - amount * 4) / image.height);
    scale = (scale < 1) ? scale : 1;
    var scaled_width = image.width * scale;
    var scaled_height = image.height * scale;
    ctx.drawImage(image,
        canvas.width / 2 - scaled_width / 2,
        canvas.height / 2 - scaled_height / 2,
        scaled_width, scaled_height);

    // Blur the image.
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img = Mock.blur(img, amount);
    ctx.putImageData(img, 0, 0);

    // Export the image.
    var new_image = new Image();
    new_image.src = canvas.toDataURL();
    canvas = null;
    return new_image;
  }
  window.console.log("Blurring failed");
  var img = new Image();
  img.src = image.src;

  if (image.width > image.height) {
    height = parseInt(height * (image.height / image.width));
  } else {
    width = parseInt(width * (image.width / image.height));
  }

  img.width = width;
  img.height = height;
  return img;
}

Mock.prototype.mockListListener_ = function(e) {
  if (e.type == MockList.EVENT_SAVEDID) {
    if (this.queue_delete_) {
      this.deleteMock();
    } else {
      this.saveFile_();
    }
  }
}

Mock.prototype.addListener = function(listener) {
  this.listeners_.push(listener);
}

Mock.prototype.callListeners_ = function(e) {
  for (var i = 0, func; func = this.listeners_[i]; i++) {
    func(e);
  }
}

Mock.prototype.setFile = function(file) {
  this.file_ = file;
  this.name = this.file_.name;
  this.type = this.file_.type;

  if (this.mocklist_.id) {
    this.saveFile_();
  }
  // Otherwise saveFile will be triggered when MockList 
  // broadcasts EVENT_SAVEDID.
}

Mock.prototype.setID = function(id) {
  this.id = id;
}

Mock.prototype.setName = function(name) {
  this.name = name;
}

Mock.prototype.load = function() {
  window.console.log("Loading mock...");
  if (this.file_) {
    this.name = this.file_.name;
    this.type = this.file_.type;

    // Load the file.
    var reader = new FileReader();  
    reader.onload = this.loadLocalFileComplete_.bind(this);
    reader.readAsDataURL(this.file_);
  } else if (this.id) {
    var url = MockList.URL_MOCK + this.id;
    window.console.log("Loading mock from: " + url);
    this.image = new Image();
    addEventListener(this.image, 'load', this.loadImageComplete_.bind(this));
    this.image.src = url;
  } else {
    throw new Error("Mock load: no data specified.");
  }
}

Mock.prototype.loadLocalFileComplete_ = function(e) {
  this.image.src = e.target.result;

  // Need to give the image time to 'soak' before using it,
  // otherwise calamity (blankness) strikes.
  setTimeout(this.loadImageComplete_.bind(this), 1);
}

Mock.prototype.loadImageComplete_ = function(e) {
  window.console.log("Load mock complete");
  this.generateThumb_();
}

Mock.prototype.generateThumb_ = function() {
  this.thumb = Mock.blurImage(this.image, 7, 240, 240);

  // Similar to loadFileComplete, we need to give the image time to
  // do whatever it does before going off and using it, otherwise it
  // will give strange results for image.width etc.
  /*
  if (this.thumb.src.length < 600 && this.thumb_attempts_ < 3) {
    window.console.log("Failed thumbnailing attempt");
    this.thumb_attempts_++;
    setTimeout(this.generateThumb_.bind(this), 1);
  } else {
  */
  this.loaded = true;
  window.console.log("Thumbnail generation complete");
  setTimeout(this.callListeners_.bind(this, {
    type : Mock.EVENT_LOADED,
    data : this
  }), 1);
}


// SAVING
Mock.prototype.saveFile_ = function() {
  if (!this.file_ || this.id) return;
  window.console.log("Saving '" + this.name + "' ...");

  var req = new XMLHttpRequest();
  req.open("POST", MockList.URL_FILE_UPLOAD + 
      '?id=' + this.mocklist_.id + 
      '&key=' + this.mocklist_.key +
      '&filename=' + this.name
      , true);
  req.upload.addEventListener("progress", this.saveFileProgress_.bind(this), false);
  req.upload.addEventListener("load", this.saveFileComplete_.bind(this), false);
  req.upload.addEventListener("error", this.saveFileError_.bind(this), false);
  req.onreadystatechange = this.saveFileResult_.bind(this, req);

  if (typeof FormData != 'undefined') {
    var form_data = new FormData();
    form_data.append('file', this.file_);
    req.send(form_data);
  } else {
    // Firefox3
    var reader = new FileReader();
    reader.onerror = function(e) {window.console.log("File read error");}
    reader.onload = function(e) {
      window.console.log("File data loaded, uploading...");
      req.sendAsBinary(e.target.result);
    }
    reader.readAsBinaryString(this.file_);   
  }
}

Mock.prototype.saveFileProgress_ = function(e) {
  if (!e.lengthComputable) return;

  var percent = Math.round((e.loaded * 100) / e.total);
  window.console.log(percent);

  this.callListeners_({
    type : Mock.EVENT_PROGRESS,
    data : percent
  });
}

Mock.prototype.saveFileComplete_ = function(e) {
  window.console.log("File upload complete");

  this.callListeners_({
    type : Mock.EVENT_PROGRESS,
    data : 100
  });
}

Mock.prototype.saveFileError_ = function(e) {
  window.console.log("File save error");
}

Mock.prototype.saveFileResult_ = function(req) {
  if (req.readyState == 4 && req.status == 200) {
    var data = JSON.parse(req.responseText);
    if (data && data.id) {
      this.id = data.id;
      this.callListeners_({
        type : Mock.EVENT_UPLOADED,
        id : this.id
      });
      window.console.log('Saved: ' + this.id);
    } else {
      window.console.log('Save error: ' + req.responseText);
    }
  }

  // We tried to delete ourselves while we were uploading.
  // time to delete us.
  if (this.queue_delete_) {
    this.deleteMock();
  }
}

// Delete
Mock.prototype.deleteMock = function() {
  window.console.log("Deleting '" + this.name + "' ...");
  if (!this.id) {
    // We don't have an id yet, so mark ourselves as deletable so that we
    // can delete us when we do have an id (we might be in the middle of
    // saving, for example).
    this.queue_delete_ = true;
    return;
  }

  var req = new XMLHttpRequest();
  req.open("GET", MockList.URL_FILE_DELETE + 
      '?id=' + this.mocklist_.id + 
      '&key=' + this.mocklist_.key +
      '&mock_id=' + this.id +
      '&filename=' + this.name
      , true);
  req.onreadystatechange = this.deleteResult_.bind(this, req);
  req.send();
}

Mock.prototype.deleteResult_ = function(req) {
  if (req.readyState == 4 && req.status == 200) {
    window.console.log("Deleted.");
    this.callListeners_({
      type : Mock.EVENT_DELETED,
      data : this
    });
  }
}