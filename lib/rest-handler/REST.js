'use strict';

// intercepter for res.end
function end() {
    // this function is always called in scope of response object
    /* jshint validthis:true */
    this._closed = true;
    this._intercepted_end.apply(this, arguments);
}

function Accept(accept) {
    var pos = accept.indexOf(';');
    if (pos !== -1) {
        this.params = accept.substring(pos+1);
        accept = accept.substring(0, pos);
    }

    pos = accept.indexOf('/');
    if (pos === -1) {
        this.type = accept;
    } else {
        this.type = accept.substring(0, pos);
        this.subtype = accept.substring(pos+1);
    }

    this.mimeType = (this.subtype ? this.type + '/' + this.subtype : this.type).toLowerCase();
}

Accept.prototype.getType = function() {
    return this.type;
};

Accept.prototype.getSubtype = function() {
    return this.subtype;
};

Accept.prototype.getMimeType = function() {
    return this.mimeType;
};

function REST(handler, domain) {
    this.handler = handler;
    this.upgrade = false;
}

REST.prototype = {

    handle: function() {

        var self = this;

        // inherit the before functions from the RESTHandler
        var before = this.handler.getBefore(),
            res = this.res;

        if (res) {
            res._intercepted_end = res.end;
            res.end = end;
        }

        var i = -1;
        var routeInvoked = false;

        var next = function() {
            if (!self.isClosed()) {
                i++;
                if (i < before.length) {
                    var beforeObj = before[i];
                    beforeObj.fn.call(beforeObj.thisObj || self, self);
                } else if (routeInvoked === false) {
                    // set flag to indicate that we invoked the main route
                    routeInvoked = true;

                    // always delegate invocation to RESTHandler because this allows
                    // centralization of all route invocation
                    self.handler.invokeRoute(self);
                } else {
                    // we already invoked the route but response is still not closed
                    // so interpret this as not found
                    self.notFound();
                }
            }
        };

        this._next = (this.domain) ? this.domain.bind(next) : next;
        this._next();
    },

    isUpgrade: function() {
        return this.upgrade === true;
    },
    
    next: function() {
        if (this._next) {
            this._next();
        }
    },

    isClosed: function() {
        return (this.upgrade !== true) && this.res._closed;
    },

    send: function(statusCode, obj) {

        if (arguments.length === 1) {
            obj = statusCode;
        } else {
            this.res.statusCode = statusCode;
        }

        this.handler.send(this, obj);
    },

    error: function(statusCode, error) {

        if (arguments.length === 1) {
            error = statusCode;
        } else {
            this.res.statusCode = statusCode;
        }

        this.handler.error(this, error);
    },

    getCookies: function() {
        if (this._cookies === undefined) {
            var req = this.req;
            var cookies;
            this._cookies = cookies = {};
            if (req.headers.cookie) {
				req.headers.cookie.split(';').forEach(function(cookie) {
	                var parts = cookie.split('=');
	                cookies[parts[0].trim()] = decodeURIComponent((parts[1] || '').trim());
	            });
            }
        }

        return this._cookies;
    },

    getCookie: function(name) {
        return this.getCookies()[name];
    },

    getBasicAuth: function() {

        if (this._basicAuth === undefined) {
            var req = this.req;
            if (req.headers.authorization) {
                var basicAuthParser = require('basic-auth-parser');
                this._basicAuth = basicAuthParser(req.headers.authorization);
            } else {
                this._basicAuth = null;
            }
        }

        return this._basicAuth;
    },

    getBody: function(callback, limit) {

        if (this._body !== undefined) {
            callback(null, this._body);
            return;
        }

        var self = this;

        var len = 0;
        var req = this.req;
        var body = [];

        req.on('data', function (data) {
            len += data.length;
            if (!limit || (len <= limit)) {
                body.push(data);
            } else {
                callback(new Error('Limit exceeded. Reached ' + len + ' characters. Limit = ' + limit));
                callback = null;
                self._body = null;
            }
        });

        req.on('end', function () {
            if (callback) {
                self._body = body.join('');
                callback(null, self._body);
            }
        });
    },

    getParsedBody: function(callback, limit) {

        if (this._parsedBody !== undefined) {
            callback(null, this._parsedBody);
            return;
        }

        var self = this;

        this.getBody(function(err, body) {

            if (err) {
                callback(err);
                return;
            }

            if (!body) {
                callback(null, null);
                return;
            }

            try {
                self._parsedBody = JSON.parse(body);
            } catch(e) {
                callback(e);
                return;
            }

            callback(null, self._parsedBody);
        }, limit);
    },

    setResponseHeader: function() {
        this.res.setHeader.apply(this.res, arguments);
    },

    getResponseHeader: function() {
        this.res.getHeader.apply(this.res, arguments);
    },

    getRequestHeaders: function() {
        return this.req.headers;
    },

    getRequestHeader: function(name) {
        return this.req.headers[name.toLowerCase()];
    },

    getAccepts: function() {
        if (!this._accepts) {
            var accepts = this.getRequestHeader('accept').split(',');

            this._accepts = new Array(accepts.length);
            this._acceptsMap = {};

            for (var i = 0; i < accepts.length; i++) {
                var accept = new Accept(accepts[i]);
                this._accepts[i] = accept;
                this._acceptsMap[accept.getMimeType()] = accept;
            }
        }

        return this._accepts;
    },

    getPreferredContentType: function(candidates) {
        var accepts = this.getAccepts();
        if (accepts.length === 0) {
            return null;
        }

        if (candidates) {
            var supported = {};
            var i;

            if (Array.isArray(candidates)) {
                for (i = 0; i < candidates.length; i++) {
                    var candidate = candidates[i];
                    supported[candidate.toLowerCase()] = candidate;
                }
            } else {
                supported[candidates.toLowerCase()] = candidates;
            }

            for (i = 0; i < accepts.length; i++) {
                var accept = accepts[i];
                var match = supported[accept.getMimeType()];
                if (match) {
                    return match;
                }
            }

            return null;
        } else {
            return accepts[0];
        }
    },

    notFound: function(message) {
        if (arguments.length === 0) {
            this.handler.notFound(this.req, this.res);
        } else {
            this.handler.notFound(message, this.req, this.res);
        }
    }
};

module.exports = REST;
