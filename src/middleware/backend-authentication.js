const nLogger = require('@financial-times/n-logger').default;
const metrics = require('next-metrics');

module.exports = (app, appName) => {
	const backendKeys = [];

	if (process.env.FT_NEXT_BACKEND_KEY) {
		backendKeys.push(process.env.FT_NEXT_BACKEND_KEY);
	}
	if (process.env.FT_NEXT_BACKEND_KEY_OLD) {
		backendKeys.push(process.env.FT_NEXT_BACKEND_KEY_OLD);
	}

	if (!backendKeys.length) {

		nLogger.warn({
			event: 'BACKEND_AUTHENTICATION_DISABLED',
			message: 'Backend authentication is disabled, this app is exposed directly to the internet. To enable, add keys in config-vars'
		});

		return;
	}

	app.use((req, res, next) => {
		// TODO - change how all this works in order to use __assets/app/{appname}
		// allow static assets, healthchecks, etc., through
		if (req.path.indexOf('/' + appName) === 0 || req.path.indexOf('/__') === 0) {
			next();
		} else if (backendKeys.indexOf(req.get('FT-Next-Backend-Key')) > -1) {
			metrics.count('express.backend_authentication.backend_key');
			res.set('FT-Backend-Authentication', true);
			next();
		} else if (backendKeys.indexOf(req.get('FT-Next-Backend-Key-Old')) > -1) {
			metrics.count('express.backend_authentication.old_backend_key');
			res.set('FT-Backend-Authentication', true);
			next();
		} else {
			metrics.count('express.backend_authentication.fail');
			res.set('FT-Backend-Authentication', false);
			/* istanbul ignore else */
			if (process.env.NODE_ENV === 'production') {
				// NOTE - setting the status text is very important as it's used by the CDN
				// to trigger stale-if-error if we mess up the key synchronisation again
				res.status(401).send('Invalid Backend Key');
			} else {
				next();
			}
		}
	});
};
