# [SWAC](https://github.com/rkusa/swac)' ![](https://dl.dropbox.com/u/6699613/swac-logo.png) CouchDB Adapter
[![Build Status](https://secure.travis-ci.org/rkusa/swac-couchdb.png)](http://travis-ci.org/rkusa/swac-couchdb) [![Dependency Status](https://gemnasium.com/rkusa/swac-couchdb.png)](https://gemnasium.com/rkusa/swac-couchdb)

```json
{ "name": "swac-couchdb",
  "version": "0.5.1" }
```

**Status:** Don't use yet.

## Usage

```js
this.use('couchdb', { db: 'name' }, function() {
  // definition
})
```

### Options

* **db** - the database name the model instances should be saved in

## Definition API

The definitions context provides the following methods:

### .view(name, obj)

**Arguments:**

* **name** - the view's name
* **obj** - an object containing at least a `map` property and optionally a `reduce` property

**Example:**

```js
this.use('couchdb', function() {
  this.view('by-user', {
    map: function(doc) {
      if(doc.$type === 'Todo') emit(doc.user, null)
    }
  })
})
```

### .view(name, fn)

**Arguments:**

* **name** - the view's name
* **fn** - a function which will be executed once the view got called

**Example:**

```js
this.use('couchdb', function() {
  this.view('by-user', function(key, req, callback) {
    if (!key || !req.user) return callback(null, [])
    var user = req.user
    this.view('Todo', 'by-group', {
      keys: user.groups,
      include_docs: true
    }, callback(err, body))
  })
})
```

## MIT License
Copyright (c) 2012-2013 Markus Ast

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.