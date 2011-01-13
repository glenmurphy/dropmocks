function MenuMocks(title, container) {
  this.node_ = createElement('a', 'menulink');
  //this.node_.href = '#';
  this.node_.addEventListener('click', this.handleMenuClick_.bind(this), false);
  window.addEventListener('resize', this.updatePosition.bind(this), false);
  setText(this.node_, title);
  container.appendChild(this.node_);

  this.node_list_ = createElement('div', 'list hidden');
  document.body.appendChild(this.node_list_);
  document.body.addEventListener('click', this.handleBodyClick_.bind(this), false);
  this.items_ = [];
  this.updatePosition();
}

MenuMocks.prototype.updatePosition = function() {
  var pos = getPosition(this.node_);
  this.node_list_.style.top = pos.y + this.node_.offsetHeight - 4;
  this.node_list_.style.left = pos.x;
};

MenuMocks.prototype.clearItems = function() {
  this.node_list_.innerHTML = '';
  this.items_ = [];
};

MenuMocks.prototype.setVisible = function(visible) {
  this.node_.style.display = visible ? 'inline-block' : 'none';
};

MenuMocks.prototype.addItem = function(name, url, selected) {
  var a = createElement('a', 'listitem' + (selected ? ' selected' : ''), this.node_list_);
  a.href = url;
  setText(a, name);
  this.updatePosition();
};

// private:
MenuMocks.prototype.handleMenuClick_ = function(e) {
  if (this.node_list_.className == 'list hidden') {
    this.showList_();
  } else {
    this.hideList_();
  }
  this.updatePosition();
  e.preventDefault();
};

MenuMocks.prototype.showList_ = function() {
  this.node_list_.className = 'list';
};

MenuMocks.prototype.hideList_ = function() {
  this.node_list_.className = 'list hidden';
};

MenuMocks.prototype.handleBodyClick_ = function(e) {
  if (e.target != this.node_)
    this.hideList_();
};
