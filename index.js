var RESTHandler = require('./lib/rest-handler/RESTHandler');

module.exports = {
	create : function(options) {
		return new RESTHandler(options);
	},

	RESTHandler : RESTHandler
};