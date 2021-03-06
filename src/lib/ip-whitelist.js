const logger = require('@financial-times/n-logger').default;
const metrics = require('next-metrics');
const fetchres = require('fetchres');
const ip = require('ip');

const backupFastlyWhitelist = require('./fastly-ip-whitelist-backup.json').addresses;
const ftWhitelist = require('./ft-ip-whitelist.json');

const fastlyWhitelistUrl = 'https://api.fastly.com/public-ip-list';

function IpWhitelist () {
	this.fetchedFastlyWhitelist = null;
	this.poll();
	setInterval(() => this.poll(), 10000); // every 10 seconds
};

IpWhitelist.prototype.poll = function () {
	return fetch(fastlyWhitelistUrl)
		.then(fetchres.json)
		.then(resp => {
			if (Array.isArray(resp.addresses) && resp.addresses.length > 0) {
				metrics.count('express.ip_whitelist.fetch_success');
				if (JSON.stringify(this.fetchedFastlyWhitelist) !== JSON.stringify(resp.addresses)) {
					logger.info({ event: 'IP_WHITELIST_UPDATE', oldSize: Array.isArray(this.fetchedFastlyWhitelist) ? this.fetchedFastlyWhitelist.length : 0, newSize: resp.addresses.length });
					metrics.count('express.ip_whitelist.update');
					this.fetchedFastlyWhitelist = resp.addresses;
				}
			} else {
				logger.error({ event: 'IP_WHITELIST_UNRECOGNISED', response: JSON.stringify(resp) });
				metrics.count('express.ip_whitelist.unrecognised');
			}
		})
		.catch(err => {
			logger.error({ event: 'IP_WHITELIST_FETCH_FAIL' }, err);
			metrics.count('express.ip_whitelist.fetch_fail');
		});
};

IpWhitelist.prototype.validate = function (ipAddress) {
	if (ipAddress.match(/^::ffff:/)) {
		ipAddress = ipAddress.replace(/^::ffff:/, '');
	}
	const ranges = [].concat(this.fetchedFastlyWhitelist || backupFastlyWhitelist, ftWhitelist);
	let i;
	for (i = 0; i < ranges.length; i++) {
		if (ip.cidrSubnet(ranges[i]).contains(ipAddress)) {
			return true;
		}
	}
	return false;
};

module.exports = IpWhitelist;
