const request = require('request-promise-native');

/**
 * Cloud function to receive Raisely events and map them
 * to Streamlabs events so they can go up during livestreams
 *
 * It also supports a custom event that can be fired from the browser
 * using the shared secret in authSecret. The event is of the same
 * format as Raisely events, but with the type of `action.taken`
 *
 * https://developers.raisely.com/docs/available-events
 * https://dev.streamlabs.com/
 *
 * To use this function, you'll need to generate an access_token
 * for Streamlabs using their OAuth flow and insert it into
 * the campaignTokens map below
 */

// Map from Raisely campaign to a streamlabs token
const campaignTokens = {
	// Map is of the form
	// 'campaign-uuid': 'streamlabs-oauth-token',
	'830a1280-6e17-11ea-858b-f7d7d2f43749': 'test-token',
};

// Secret to verify origin of webhooks
const authSecret = 'sh!';

const allowedOrigins = ['cause-for-hope.raisely.com'];

/**
 * Forward a donation or subscription event to Streamlabs
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */
exports.integration = async function integration(req, res) {
	const secret = req.body.secret;

	// CORS so custom events can also be sent from the browser
	res.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT');
	res.set(
		'Access-Control-Allow-Headers',
		'Access-Control-Allow-Headers, Authorization, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers'
	);
	// only allow CORS from specific hosts
	const allowedOrigin = allowedOrigins.includes(req.headers.origin) ? req.headers.origin : allowedOrigin[0];
	res.set('Access-Control-Allow-Origin', allowedOrigin);
	res.set('Access-Control-Allow-Credentials', true);
	res.set('Access-Control-Max-Age', '86400');

	// If it's an options request, end here
	if (req.method.toLowerCase() === 'options') {
		res.status(204).send();
		return true;
	}

	// Verify the secret on the webhook
	if (!secret || secret !== authSecret) {
		res.status(200).send({ success: false, message: 'invalid auth' });
		return true;
	}

	const event = req.body.data;

	const campaignUuid = event.source.split(':')[1];

	// Lookup the stream labs access token associated with the campaign
	const access_token = campaignTokens[campaignUuid];

	if (!access_token) {
		res.status(200).send({
			success: false,
			message: `Campaign unknown ${campaignUuid}`,
		});
		return true;
	}

	let response;

	console.log(`Event received, ${JSON.stringify(event)}`);

	// Differentiate events
	if (event.type === 'donation.succeeded') {
		response = await saveDonation(req, res, campaignUuid, access_token);
	} else if (event.type === 'subscription.succeeded') {
		response = await sendSubscription(req, res, campaignUuid, access_token);
	} else if (event.type === 'action.taken') {
		// Custom action
		response = await sendAction(req, res, campaignUuid, access_token);
	} else {
		// Send a 200 so the webhook doesn't send us a bunch of retries
		res.status(200).send({
			success: false,
			message: `unknown event ${event.type}`,
		});
		return true;
	}

	res.status(200).send({ success: true, response });
	return true;
};

/**
 * Inform streamlabs that a new donation has been received
 *
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {string} campaignUuid The UUID of the campaign the action originated from
 * @param {string} access_token The stream labs access token
 */
async function saveDonation(req, res, campaignUuid, access_token) {
	const donation = req.body.data.data;

	console.log(
		`(donation ${donation.uuid}, campaign: ${campaignUuid}) processing`
	);

	const name = getName(donation);

	// Streamlabs payload
	const steamlabsEvent = {
		name,
		message: donation.message,
		identifier: donation.user.uuid,
		amount: donation.amount / 100,
		currency: donation.currency,
		// created_at: donation.createdAt,
		access_token,
	};

	const response = await request.post(
		'https://streamlabs.com/api/v1.0/donations',
		{
			form: steamlabsEvent,
		}
	);

	return response;
}

/**
 * Sends two requests to streamlabs from the event
 * 1) Adds a point to the username
 * 2) Sends an alert with the message
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {string} campaignUuid The UUID of the campaign the action originated from
 * @param {string} access_token The stream labs access token
 */
async function sendAction(req, res, campaignUuid, access_token) {
	const action = req.body.data.data;

	console.log(
		`(action ${action.name}, user: ${action.username}, campaign: ${campaignUuid}) processing`
	);

	// Streamlabs payloads
	const pointsData = {
		access_token,
		username: action.username,
		points: 1,
	};

	const alertData = {
		access_token,
		type: 'follow',
		message: `${action.message}`,
	};

	const response = await Promise.all([
		request.post('https://streamlabs.com/api/v1.0/points/user_point_edit', {
		    form: pointsData,
		}),
		request.post('https://streamlabs.com/api/v1.0/alerts', {
			form: alertData,
		}),
	]);

	return response;
}

/**
 * Inform streamlabs that a new subscription has been started
 *
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {string} campaignUuid The UUID of the campaign the action originated from
 * @param {string} access_token The stream labs access token
 */
async function sendSubscription(req, res, campaignUuid, access_token) {
	const subscription = req.body.data.data;

	console.log(
		`(subscription ${subscription.uuid}, campaign: ${campaignUuid}) processing`
	);

	const name = getName(subscription);

	// Streamlabs payload
	const steamlabsEvent = {
		access_token,
		type: 'subscription',
		message: `${name} subscribed`,
		user_message: subscription.message,
	};

	const response = await request.post(
		'https://streamlabs.com/api/v1.0/alerts',
		{
			form: steamlabsEvent,
		}
	);

	return response;
}

/**
 * Get a name to use from a donation/subscription object
 * @param {object} donation A Raisely donation or subscription
 */
function getName(donation) {
	return donation.anonymous
		? 'Someone'
		: (
				donation.user.preferredName ||
				donation.user.firstName ||
				donation.user.fullName
		  ).substring(0, 25);
}
