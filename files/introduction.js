function Introduction(mocklist) {
  this.mocklist_ = mocklist;
  this.mocklist_.addListener(this.mockListListener_.bind(this));

  $('introduction').style.display = 'block';
  setTimeout(function() {
    $('introduction').style.top = '50%';
    $('introduction').style.opacity = '1';
  }, 1);

  if (isValidBrowser()) {
    $('intro-bg').className = 'compat';
    $('instructions').style.display = 'block';
  } else {
    $('intro-bg').className = 'uncompat';
    $('lowbrowser').style.display = 'block';
  }
}

Introduction.prototype.mockListListener_ = function(e) {
  if (e.type == MockList.EVENT_MOCKSDROPPED) {
    $('intro-bg').style.opacity = 0;
    $('introduction').style.top = '60%';
    setTimeout(function() {
      $('intro-bg').style.display = 'none';
      $('introduction').style.display = 'none';
    }, 550);
  }
}