const nock = require('nock');
const chai = require('chai');
const chaiSubset = require('chai-subset');

const { integration: streamlabs } = require('./streamlabs');

chai.use(chaiSubset);
const { expect } = chai;

const secret = 'sh!';

const campaignUuid = '830a1280-6e17-11ea-858b-f7d7d2f43749';

const donation = {
	uuid: '<test-uuid>',
	user: { firstName: 'Alexandria', uuid: 'user-uuid' },
	amount: 2050,
	currency: 'AUD',
	message: 'Good luck!',
};

const makeJSON = (body) =>
	JSON.parse(
		`{"${decodeURIComponent(
			body.replace(/&/g, '","').replace(/=/g, '":"')
		)}"}`
	);

describe('Streamlabs', () => {
	let req;
	let res;
	let body;
	let result;
	let nockRequest;
	describe('WHEN donation.succeeded', () => {
		before(async () => {
			nockRequest = doNock('/api/v1.0/donations');
			({ req, res } = prepare({
				secret,
				data: {
					type: 'donation.succeeded',
					source: `campaign:${campaignUuid}`,
					data: donation,
				},
			}));

			try {
				result = await streamlabs(req, res);
				return result;
			} catch (e) {
				console.error(e);
				throw e;
			}
		});
		itHasGoodResult();
		it('sends event to streamlabs', () => {
			expect(nockRequest.body).to.containSubset({
				name: 'Alexandria',
				message: 'Good luck!',
				identifier: 'user-uuid',
				amount: '20.5',
				currency: 'AUD',
			});
		});
	});

	describe('WHEN subscription.succeeded', () => {
		before(async () => {
			nockRequest = doNock('/api/v1.0/alerts');
			({ req, res } = prepare({
				secret,
				data: {
					source: `campaign:${campaignUuid}`,
					type: 'subscription.succeeded',
					data: donation,
				},
			}));

			try {
				result = await streamlabs(req, res);
				return result;
			} catch (e) {
				console.error(e);
				throw e;
			}
		});
		itHasGoodResult();
		it('sends event to streamlabs', () => {
			expect(nockRequest.body).to.containSubset({
				type: 'subscription',
				message: `Alexandria subscribed`,
				user_message: 'Good luck!',
			});
		});
	});

	describe('WHEN action.taken', () => {
		let alertRequest;
		let pointRequest;
		before(async () => {
			alertRequest = doNock('/api/v1.0/alerts');
			pointRequest = doNock('/api/v1.0/points/user_point_edit');

			({ req, res } = prepare({
				secret,
				data: {
					source: `campaign:${campaignUuid}`,
					type: 'action.taken',
					data: {
						message: 'Alexandria is taking action',
						username: 'Alexandria',
					},
				},
			}));

			try {
				result = await streamlabs(req, res);
				return result;
			} catch (e) {
				console.error(e);
				throw e;
			}
		});
		itHasGoodResult();
		it('sends event to streamlabs', () => {
			expect(alertRequest.body).to.containSubset({
				type: 'follow',
				message: `Alexandria is taking action`,
			});
			expect(pointRequest.body).to.containSubset({
				username: 'Alexandria',
				points: '1',
			});
		});
	});

	function itHasGoodResult() {
		it('has good result', () => {
			expect(result).to.eq(true);
		});
		it('returns success true', () => {
			expect(res.body).to.containSubset({ success: true });
		});
	}
});

function prepare(body) {
	const req = {
		body,
		headers: {
			origin: 'cause-for-hope.raisely.com',
		},
		method: 'GET',
	};
	const res = {
		headers: {},
	};
	res.status = (code) => {
		res.statusCode = code;
		return res.status;
	};
	res.status.send = (response) => (res.body = response);
	res.set = (header, value) => (res.headers[header] = value);

	return { req, res };
}

function doNock(url) {
	let result = {};
	const n = nock('https://streamlabs.com')
		.log(console.log)
		.post(url)
		.reply(200, function donate(uri, requestBody) {
			result.body = makeJSON(requestBody);
			return requestBody;
		});
	return result;
}
