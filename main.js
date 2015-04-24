/*jshint node:true*/
"use strict";

require('es6-promise').polyfill();
require('isomorphic-fetch');

var express = require('express');
var errorsHandler = require('express-errors-handler');
var flags = require('next-feature-flags-client');
var handlebars = require('ft-next-handlebars');
var barriers = require('next-barrier-component');
var metrics = require('next-metrics');
var robots = require('./src/express/robots');
var normalizeName = require('./src/normalize-name');

var serviceMatchers = {
	'capi-v1-article': /^https?:\/\/api\.ft\.com\/content\/items\/v1\/[\w\-]+/,
	'capi-v1-page': /^https?:\/\/api\.ft\.com\/site\/v1\/pages\/[\w\-]+/,
	'capi-v1-pages-list': /^https?:\/\/api\.ft\.com\/site\/v1\/pages/,
	'sapi': /^https?:\/\/api\.ft\.com\/content\/search\/v1/,
	'elastic-v1-article': /^https?:\/\/[\w\-]+\.foundcluster\.com:9243\/v1_api_v2\/item/,
	'elastic-v2-article': /^https?:\/\/[\w\-]+\.foundcluster\.com:9243\/v2_api_v[12]\/item/,
	'user-prefs': /^https?:\/\/ft-next-api-user-prefs-v002\.herokuapp\.com/,
	'flags': /^https?:\/\/ft-next-api-feature-flags\.herokuapp\.com\/__flags\.json/,
	// 'elastic-search':
	'capi-v2-article': /^https?:\/\/api\.ft\.com\/content\/[\w\-]+/,
	'capi-v2-enriched-article': /^https?:\/\/api\.ft\.com\/enrichedcontent\/[\w\-]+/,
	'capi-v2-lists': /^https?:\/\/api\.ft\.com\/lists\/[\w\-]+/,
	'capi-v2-thing': /^https?:\/\/api\.ft\.com\/things\/[\w\-]+/,
	'capi-v2-people': /^https?:\/\/api\.ft\.com\/people\/[\w\-]+/,
	'capi-v2-organisation': /^https?:\/\/api\.ft\.com\/organisations\/[\w\-]+/,
	'capi-v2-content-by-concept': /^https?:\/\/api\.ft\.com\/content\?isAnnotatedBy=http:\/\/api\.ft\.com\/things\/[\w\-]+/,
	// fastft
	'fastft': /https?:\/\/clamo\.ftdata\.co\.uk\/api/,
	// v1 to v2 mapping endpoints
	'v1-to-v2-mapping-people': /^https:\/\/next-v1tov2-mapping-dev\.herokuapp\.com\/concordance_mapping_v1tov2\/people\/[A-Za-z0-9=\-]+$/,
	'v1-to-v2-mapping-organisations': /^https:\/\/next-v1tov2-mapping-dev\.herokuapp\.com\/concordance_mapping_v1tov2\/organisations\/[A-Za-z0-9=\-]+$/,
	// ft.com (temporary for article comment hack)
	'ft.com': /^http:\/\/www\.ft\.com\/cms\/s\/[\w\-]+\.html$/,
	'beacon': /^http:\/\/beacon-next\.ft\.com\.global\.prod\.fastly\.net\/px\.gif/,
	'session': /^https\:\/\/session-next\.ft\.com/
};

module.exports = function(options) {
	options = options || {};
	var defaults = {
		withFlags: true,
		withHandlebars: true
	};

	Object.keys(defaults).forEach(function (prop) {
		if (typeof options[prop] === 'undefined') {
			options[prop] = defaults[prop];
		}
	});

	var app = express();
	var name = options.name;
	var directory = options.directory || process.cwd();


	if (!name) {
		try {
			var packageJson = require(directory + '/package.json');
			name = packageJson.name;
		} catch(e) {
			// Safely ignorable error
		}
	}
	if (!name) throw new Error("Please specify an application name");
	app.locals.__name = name = normalizeName(name);
	app.locals.__environment = process.env.NODE_ENV || '';
	app.locals.__isProduction = app.locals.__environment.toUpperCase() === 'PRODUCTION';
	app.locals.__rootDirectory = directory;


	if (!app.locals.__isProduction) {
		app.use('/' + name, express.static(directory + '/public'));
	}

	app.get('/robots.txt', robots);

	var handlebarsPromise = Promise.resolve();

	if (options.withHandlebars) {
		var helpers = options.helpers || {};
		if (options.withFlags) {
			helpers.flagStatuses = require('./src/handlebars/flag-statuses');
		}
		helpers.hashedAsset = require('./src/handlebars/hashed-asset');

		handlebarsPromise = handlebars(app, {
			partialsDir: [
				directory + '/views/partials'
			],
			defaultLayout: false,
			layoutsDir: __dirname + '/layouts',
			helpers: helpers,
			directory: directory
		});
	}

	if (packageJson.dependencies['next-metrics']) {
		console.error('When using next-express avoid requiring next-metrics as a direct dependency');
		console.error('- it risks duplicating some data collection');
		console.error('Use `require(\'ft-next-express\').metrics` instead');
		throw 'Don\'t require next-metrics directly!';
	}

	metrics.init({ app: name, flushEvery: 40000 });
	app.use(function(req, res, next) {
		metrics.instrument(req, { as: 'express.http.req' });
		metrics.instrument(res, { as: 'express.http.res' });
		next();
	});
	if (options.serviceDependencies) {
		Object.keys(options.serviceDependencies).forEach(function (serv) {
			serviceMatchers[serv] = options.serviceDependencies[serv];
		});
	}
	metrics.fetch.instrument({
		serviceMatchers: serviceMatchers,
		onUninstrumented: function (url, opts) {
			errorsHandler.captureMessage('Service ' + url.split('?')[0] + ' called but no metrics set up. See next-express README for details');
		}
	});

	app.get('/' + name + '/__about', function(req, res) {
		res.set({ 'Cache-Control': 'no-cache' });
		res.sendFile(directory + '/public/__about.json');
	});
	app.use(barriers.middleware);

	var flagsPromise = Promise.resolve();

	if (options.withFlags) {
		flagsPromise = flags.init({ url: 'http://ft-next-api-feature-flags.herokuapp.com/__flags.json' });
		app.use(flags.middleware);
	}


	var actualAppListen = app.listen;

	app.listen = function() {
		var args = arguments;
		app.use(errorsHandler.middleware);

		return Promise.all([flagsPromise, handlebarsPromise]).then(function() {
			metrics.count('express.start');
			actualAppListen.apply(app, args);
		})
			.catch(function(err) {

				// Crash app if flags or handlebars fail
				setTimeout(function() {
					throw err;
				}, 0);
			});
	};

	return app;
};

module.exports.Router = express.Router;
module.exports.services = serviceMatchers;
module.exports.metrics = metrics;
