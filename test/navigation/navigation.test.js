'use strict';

const request = require('supertest');
const nextExpress = require('../../main');
const expect = require('chai').expect;
const sinon = require('sinon');
const verifyAssetsExist = require('../../src/lib/verify-assets-exist');

describe('Navigation model', () => {
	let app;
	let locals;

	beforeEach(() => {
		sinon.stub(verifyAssetsExist, 'verify');
		app = nextExpress({ withNavigation: true, withAnonMiddleware: true, withFlags:true, withHandlebars:false });
		app.get('/', (req, res) => {
			locals = res.locals;
			res.sendStatus(200).end();
		});
	});

	afterEach(() => {
		verifyAssetsExist.verify.restore();
	});

	it('Should set the myFT property to an object if user is not anonymous', done => {
		request(app)
			.get('/')
			.set('FT-User-UUID', 'xvdsvdfvdfs')
			.expect(() => {
				expect(locals.navigationModel.myFT).to.be.an('object');
			})
			.end(done);
	});

	it('Should set the myAccount property to an object if user is not anonymous', done => {
		request(app)
			.get('/')
			.set('FT-User-UUID', 'dkvbdfkjvbh')
			.expect(() => {
				expect(locals.navigationModel.myAccount).to.be.an('object');
			})
			.end(done);
	});

	it('Should set the signInUrl property to a string beginning with `https://` or  `/`', done => {
		request(app)
			.get('/')
			.expect(() => {
				expect(locals.navigationModel.signInUrl).to.be.a('string');
				expect(locals.navigationModel.signInUrl).to.match(/^(https:\/)?\//);
			})
			.end(done);
	});

	it('Should set the subscribeUrl property to a string beginning with `https://` or  `/`', done => {
		request(app)
			.get('/')
			.expect(() => {
				expect(locals.navigationModel.subscribeUrl).to.be.a('string');
				expect(locals.navigationModel.subscribeUrl).to.match(/^(https:\/)?\//);
			})
			.end(done);
	});
});
