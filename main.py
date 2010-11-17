import os, sys
from google.appengine.api.labs import taskqueue
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app
from google.appengine.ext.webapp import template
from google.appengine.ext import db
from google.appengine.api import users
from google.appengine.api import memcache
from django.utils import simplejson
import random
import datetime

# FUNCTIONS -------------------------------------------------------------------
import string
ALPHABET = string.ascii_uppercase + string.ascii_lowercase + \
           string.digits + '-_'
ALPHABET_REVERSE = dict((c, i) for (i, c) in enumerate(ALPHABET))
BASE = len(ALPHABET)
SIGN_CHARACTER = '$'

def id_encode(n):
  if n < 0:
    return SIGN_CHARACTER + num_encode(-n)
  s = []
  while True:
    n, r = divmod(n, BASE)
    s.append(ALPHABET[r])
    if n == 0: break
  return ''.join(reversed(s))

def id_decode(s):
    if s[0] == SIGN_CHARACTER:
        return -num_decode(s[1:])
    n = 0
    for c in s:
        n = n * BASE + ALPHABET_REVERSE[c]
    return n

def dbMockList(id):
  return MockList.get_by_id(int(id_decode(id)))

def dbMock(id):
  return Mock.get_by_id(int(id_decode(id)))

# MODELS ----------------------------------------------------------------------
class Owner(db.Model):
  name = db.StringProperty(multiline=False)
  email = db.StringProperty(multiline=False)
  lastseen = db.DateTimeProperty(auto_now=True)

  # Stores the signed-in-user ID.
  user_id = db.StringProperty(multiline=False)

  # Stores the not-signed-in-user ID.
  hobo_id = db.StringProperty(multiline=False)

class MockList(db.Model):
  owner = db.ReferenceProperty(Owner)
  edit_key = db.StringProperty(multiline=False)
  name = db.StringProperty(multiline=False)
  description = db.StringProperty(multiline=False)
  mocks = db.ListProperty(str, default=[])
  mock_names_cache = db.ListProperty(str, default=[])
  date = db.DateTimeProperty(auto_now_add=True)
  views = db.IntegerProperty(default=0)
  last_viewed = db.DateTimeProperty()
  last_processed = db.DateTimeProperty(default=0)

  def get_id(self):
    return id_encode(self.key().id())

class MockListView(db.Model):
  mocklist = db.ReferenceProperty(MockList)
  date = db.DateTimeProperty(auto_now_add=True)

class Mock(db.Model):
  name = db.StringProperty(multiline=False)
  data = db.BlobProperty()
  mimetype = db.StringProperty(multiline=False)
  mocklist = db.ReferenceProperty(MockList)
  date = db.DateTimeProperty(auto_now_add=True)

  def get_id(self):
    return id_encode(self.key().id())

def generateRandomKey():
  return str(random.randint(0, sys.maxint))

def setCookie(handler, name, value):
  expires = datetime.datetime.now() + datetime.timedelta(weeks=52)
  expires_rfc822 = expires.strftime('%a, %d %b %Y %H:%M:%S GMT')
  cookie = "%s=%s;expires=%s;path=/" % (name, value, expires_rfc822)
  handler.response.headers.add_header('Set-Cookie', cookie)

def getOwner(handler, generate=False):
  # Generate user if none exists.
  user = users.get_current_user()
  owner = None
  if user:
    owner = Owner.gql("WHERE user_id = :1", user.user_id()).get()
  
  if not owner and 'hobo_id' in handler.request.cookies and handler.request.cookies['hobo_id'] != '':
    owner = Owner.gql("WHERE hobo_id = :1", handler.request.cookies['hobo_id']).get()

  if not owner and generate:
    hobo_id = generateRandomKey()
    owner = Owner()
    owner.hobo_id = hobo_id
    owner.put()
    setCookie(handler, 'hobo_id', hobo_id)

  return owner

def generateSignIn(handler, owner):
  if owner and owner.user_id:
    return "%s (<a href=\"%s\">Sign out</a>)" % (owner.name, users.create_logout_url("/"))
  else:
    return "<a href=\"%s\">Sign in</a>" % users.create_login_url("/signin/?d=" + handler.request.path)

def getOwnerDetails(handler, owner):
  mocklists = []
  if owner:
    q = MockList.gql("WHERE owner = :1", owner).fetch(1000)
    for mocklist in q:
      mocklists.append({
        'id' : mocklist.get_id(),
        'name' : mocklist.name
      })

    return {
      'mocklists' : mocklists,
      'name' : str(owner.email),
      'sign_in_url' : users.create_login_url("/signin/?d=" + handler.request.path),
      'sign_out_url' : users.create_logout_url("/"),
      'signed_in' : bool(users.get_current_user()),
    }
  else:
    return {
      'mocklists' : [],
      'name' : '',
      'sign_in_url' : users.create_login_url("/signin/?d=" + handler.request.path),
      'sign_out_url' : users.create_logout_url("/"),
      'signed_in' : False,
    }

def cacheMockNames(mocklist):
  mock_names = []
  for mid in mocklist.mocks:
    mock_names.append(dbMock(mid).name)
  mocklist.mock_names_cache = mock_names

# MAIN ------------------------------------------------------------------------
class MainPage(webapp.RequestHandler):
  def get(self):
    path = os.path.join(os.path.dirname(__file__), "index.html")
    # Get owner details
    owner = getOwner(self, False)

    self.response.out.write(template.render(path, {
      'signin' : generateSignIn(self, owner),
      'signed_in' : bool(users.get_current_user()),
      'user' : simplejson.dumps(getOwnerDetails(self, owner))
    }))

class View(webapp.RequestHandler):
  def get(self, id):
    # Get mocklist.
    mocklist = dbMockList(id)
    if not mocklist:
      self.response.out.write("MockList not found")
      return

    if len(mocklist.mock_names_cache) != len(mocklist.mocks):
      cacheMockNames(mocklist)
      mocklist.put()

    mocks = []
    i = 0
    for mock_id in mocklist.mocks:
      mocks.append({
        'id' : mock_id,
        'name' : mocklist.mock_names_cache[i]
      })
      i = i + 1

    if mocklist.name:
      name = mocklist.name.encode('utf-8')
    else:
      name = ''

    mocklistdata = {
      'name' : name,
      'id' : str(mocklist.get_id()),
      'description' : str(mocklist.description),
      'mocks' : mocks,
    }

    # Check if current user owns it.
    owner = getOwner(self, False)
    if owner and mocklist.owner and mocklist.owner.key() == owner.key():
      mocklistdata['key'] = mocklist.edit_key
    json = simplejson.dumps(mocklistdata)

    path = os.path.join(os.path.dirname(__file__), "viewer.html")
    self.response.out.write(template.render(path, {
      'json': json,
      'user' : simplejson.dumps(getOwnerDetails(self, owner))
    }))

    view = MockListView()
    view.mocklist = mocklist
    view.put()

class ViewMock(webapp.RequestHandler):
  def get(self, id):
    mock = dbMock(id)

    """
    referer = self.request.headers.get("Referer")
    if referer:
      referer = referer.split("/")
      if len(referer) >= 2:
        referer = referer[2]    

    host = self.request.url.split("/")[2]
    if (referer != host):
      self.redirect('http://' + host + '/m' + mock.mocklist.get_id())
      return
    """

    if mock.mimetype:
      self.response.headers['Content-Type'] = mock.mimetype
    else:
      self.response.headers['Content-Type'] = 'image/png'
    self.response.out.write(mock.data)

class SaveMock(webapp.RequestHandler):
  def post(self):
    id = self.request.get('id')
    edit_key = self.request.get('key')
    filename = self.request.get('filename')

    mocklist = dbMockList(id)
    if mocklist.edit_key != edit_key:
      self.response.out.write('invalid edit key')
      return

    mock = Mock()
    mock.name = filename
    if self.request.POST:
      # FormData
      image_file = self.request.POST['file']
      mock.mimetype = image_file.type
      mock.data = db.Blob(image_file.value)
    else:
      # Firefox3
      mock.data = self.request.body
    mock.mocklist = mocklist
    mock.put()

    self.response.out.write(simplejson.dumps({
      'id' : str(mock.get_id())
    }))

class DeleteMock(webapp.RequestHandler):
  def get(self):
    id = self.request.get('id')
    mock_id = self.request.get('mock_id')
    edit_key = self.request.get('key')
    filename = self.request.get('filename')

    # Check for delete permissions.
    mocklist = dbMockList(id)
    if mocklist.edit_key != edit_key:
      self.response.out.write('invalid edit key')
      return
    
    mock = dbMock(mock_id)
    if mock:
      mock.delete()

class GetID(webapp.RequestHandler):
  def get(self):
    mocklist = MockList()
    mocklist.edit_key = generateRandomKey()
    mocklist.put()

    self.response.out.write(simplejson.dumps({
      'id' : str(mocklist.get_id()),
      'key' : str(mocklist.edit_key)
    }))

class SaveMockList(webapp.RequestHandler):
  def post(self):
    owner = getOwner(self, True)
    data = simplejson.loads(self.request.body)
    mocklist = dbMockList(data['id'])
    if not mocklist:
      self.response.out.write("Mocklist not found")
      return

    mocklist.owner = owner
    mocklist.name = data['name']
    # TODO: verify that this mocklist owns the mocks
    mocklist.mocks = data['mocks']

    # Cache the mock's names.
    cacheMockNames(mocklist)

    mocklist.put()

class GetMockLists(webapp.RequestHandler):
  def get(self):
    owner = getOwner(self, False)
    if owner:
      q = MockList.gql("WHERE owner = :1", owner).fetch(1000)
      mocklists = []
      for mocklist in q:
        mocklists.append(mocklist.get_id())

      self.response.out.write(simplejson.dumps(mocklists))

class DeleteMockList(webapp.RequestHandler):
  def get(self):
    id = self.request.get('id')
    key = self.request.get('key')

    owner = getOwner(self, False)
    if not owner: return

    mocklist = dbMockList(id)
    if not mocklist: return

    if owner and mocklist.owner and mocklist.owner.key() == owner.key() and key == mocklist.edit_key:
      q = Mock.gql("WHERE mocklist = :1", (mocklist)).fetch(1000)
      for mock in q:
        mock.delete()
      mocklist.delete()
      self.response.out.write('{"success":true}')

class ManualUpload(webapp.RequestHandler):
  def post(self):
    id = self.request.get('id')
    edit_key = self.request.get('key')

    mocklist = dbMockList(id)
    if mocklist.edit_key != edit_key:
      self.response.out.write('invalid edit key')
      return

    mock = Mock()
    image_file = self.request.POST['file']
    mock.name = image_file.filename
    mock.mimetype = image_file.type
    mock.data = db.Blob(image_file.value)
    mock.mocklist = mocklist
    mock.put()

    self.response.out.write(simplejson.dumps({
      'id' : str(mock.get_id())
    }))

class SignIn(webapp.RequestHandler):
  def get(self):
    user = users.get_current_user()
    if user:
      # Use existing user or generate a new one if they don't exist.
      owner = Owner.gql("WHERE user_id = :1", user.user_id()).get()
      if not owner:
        owner = Owner()
      owner.name = user.nickname()
      owner.email = user.email()
      owner.user_id = user.user_id()
      owner.hobo_id = ''
      owner.put()

      # Migrate not-signed-in mocks to account.
      old_owner = None
      if 'hobo_id' in self.request.cookies:
        old_owner = Owner.gql("WHERE hobo_id = :1", self.request.cookies['hobo_id']).get()
      if old_owner and owner != old_owner:
        mocklists = MockList.gql("WHERE owner = :1", old_owner).fetch(1000)
        for mocklist in mocklists:
          mocklist.owner = owner
          mocklist.put()
        old_owner.delete()

      if self.request.get("d"):
        self.redirect(self.request.get("d"))
      else:
        self.redirect("/")
    else:
      users.create_login_url("/signin/")

class UpdateModel(webapp.RequestHandler):
  def get(self):
    id = MockList.gql('ORDER BY edit_key DESC').get().key()
    # taskqueue.add(url="/admin/updatemodel/", params={'id': id})
    self.response.out.write("Processing started")

  def post(self):
    id = self.request.get("id")

    mocklists = MockList.gql("WHERE edit_key <= :1 ORDER BY edit_key DESC LIMIT 200", id)
    lastid = None
    count = 1
    for mocklist in mocklists:
      lastid = mocklist.edit_key
      mocklist.put()
      count += 1

    if count >= 199:
      pass
      # taskqueue.add(url="/admin/updatemodel/", params={'id': lastid})

class ProcessVisits(webapp.RequestHandler):
  def get(self):
    limit = 50

    now = datetime.datetime.now()

    day = now - datetime.timedelta(days=1)
    week = now - datetime.timedelta(days=7)
    month = now - datetime.timedelta(days=30)

    mocklists = MockList.gql("WHERE last_processed < :1 LIMIT %d" % limit, day)

    listcount = 0
    for mocklist in mocklists:
      listcount += 1
      count = MockListView.gql("WHERE mocklist = :1", mocklist).count()
      mocklist.count = count
      if count > 0:
        mocklist.last_viewed = MockListView.gql("WHERE mocklist = :1 ORDER BY date DESC", mocklist).get().date
      else:
        mocklist.last_viewed = None
      mocklist.last_processed = now
      mocklist.put()

      self.response.out.write("Mocklist %s<br />" % mocklist.get_id())
      if mocklist.owner:
        self.response.out.write("Owner: %s - %s - %s - %s<br />" % (mocklist.owner.user_id, mocklist.owner.hobo_id, mocklist.owner.email, mocklist.owner.lastseen))
      else:
        self.response.out.write("Owner: none<br />")
      self.response.out.write("Viewed: %s<br />" % count)
      self.response.out.write("Created: %s (%s)<br />" % (mocklist.date, now - mocklist.date))

      if mocklist.last_viewed != None: 
        self.response.out.write("Last Viewed: %s (%s)<br />" % (mocklist.last_viewed, now - mocklist.last_viewed))
      else:
        self.response.out.write("Last Viewed: Never<br />")

      if not (mocklist.owner and mocklist.owner.email):
        if (mocklist.date < week and mocklist.last_viewed == None) or (mocklist.last_viewed and mocklist.last_viewed < month):
          taskqueue.add(url="/admin/delete/?id=%s" % mostlist.get_id(), method='GET')
          self.response.out.write("GONNA BE DELETED!<br />")

      self.response.out.write("<br />")

    if listcount >= limit:
      self.response.out.write("MORE TO GO")
      # We reached the end. Continue onwards!
      # taskqueue.add(url="/admin/processvisits/", method='GET')

application = webapp.WSGIApplication([
  (r'/m(.*)', View),
  (r'/i(.*)', ViewMock),
  ('/api/getid/', GetID),
  ('/api/savemock/', SaveMock),
  ('/api/deletemock/', DeleteMock),
  ('/api/savemocklist/', SaveMockList),
  ('/api/getmocklists/', GetMockLists),
  ('/api/deletemocklist/', DeleteMockList),
  ('/api/manualupload/', ManualUpload),
  ('/signin/', SignIn),
  ('/admin/updatemodel/', UpdateModel),
  ('/admin/processvisits/', ProcessVisits),
  ('/', MainPage),
], debug=False)

def main():
  run_wsgi_app(application)
if __name__ == "__main__":
  main()