const puppeteer = require('puppeteer');

let skipping = false;

const config = {
	// all messages can be arrays (recommended)
	greeting_message: 'hi there',
	asking_message: 'do you wanna add my discord lol',
	giving_message: 'alr its cheese',
	ending_message: 'byeeee',

	send_giving_and_ending_message_together: true,

	blacklisted_replies: ['bot?', 'i hate cheese'], // if the strager says this, skip them

	typing_delay: 10, // the delay inbetween typing character (ms)

	max_wait_time: 30 // if the stranger dosnt reply within this time, skip them (seconds)
};

const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

const sendMessage = async (page, message, delay = config.typing_delay) => {
	await page.waitForSelector('.chatBox_messages span.text_auther.Host');

	await page.waitForSelector('.input');
	await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, '.input');
	await page.type('.input', message, { delay });

	await page.waitForSelector('.inputBox_btn.send:not([disabled])');

	const send = await page.$('.inputBox_btn.send');
	await send.click();
};

const clickReady = async (page) => {
	await page.waitForSelector('.inputBox_btn.success');
	const ready = await page.$('.inputBox_btn.success');
	await ready.click();
};

const skipPerson = async (page) => {
	skipping = true;

	await page.waitForSelector('.inputBox_btn.warn');
	const skip1 = await page.$('.inputBox_btn.warn');
	await skip1.click();

	await page.waitForSelector('.inputBox_btn.danger');
	const skip2 = await page.$('.inputBox_btn.danger');
	await skip2.click();

	await clickReady(page);

	skipping = false;
};

const checkSkipButton = async (page) => {
	while (true) {
		const start = await page.$('.inputBox_btn.success');
		if (start && !skipping) {
			await clickReady(page);
		};

		await delay(1000);
	};
};

const checkReply = async (page) => {
	const messages = await page.evaluate(() => {
		const messageElements = [...document.querySelectorAll('.chatBox_messages .text_auther.Stranger')];
		return messageElements.map(el => el.textContent);
	});

	return messages.some(message => 
		config.blacklisted_replies.some(words => 
			message.toLowerCase().includes(words.toLowerCase())
		)
	);
};

const checkSkipped = async (page) => {
	const disconnected = await page.evaluate(() => {
        const skipedElement = document.querySelector('.chatBox_messages_bottom .text_msg.has-emoji img[alt="❌"]');
        return !!skipedElement;
    });

    return disconnected;
};

const getMessage = (type) => {
	const message = config[type + '_message'];
	const isArray = Array.isArray(message);

	if (isArray) return message[Math.floor(Math.random() * message.length)];

	return message;
};

const waitForReply = async (page) => {
	let timedOut = false;

	const onReply = page.waitForSelector('.chatBox_messages .text_auther.Stranger:not([data-checked])', {
		timeout: config.max_wait_time * 1000
	});

	const onTimeout = delay(config.max_wait_time * 1000).then(() => {
		timedOut = true;
		return null;
	});

	await Promise.race([
		onReply,
		onTimeout
	]);

	if (timedOut) return false;

	const hasBadReply = await checkReply(page);
	if (hasBadReply) return false;

	await page.evaluate(() => {
		const element = document.querySelectorAll('.chatBox_messages .text_auther.Stranger:not([data-checked])');
		element.forEach(el => {
			el.setAttribute('data-checked', 'true');
		});
	});

	return true;
};

const init = async (page) => {
	checkSkipButton(page);

	await page.evaluate(() => {
		const chatbox = document.querySelector('.chatBox_messages');
		if (chatbox) {
			window.chatboxCleared = false;

			new MutationObserver(mutationList => {
				mutationList.forEach(mutation => {
					if (mutation.removedNodes.length > 0 || chatbox.children.length === 0) {
						window.chatboxCleared = true;
					};
				});
			}).observe(chatbox, { childList: true });
		};
	});

	while (true) {
		const chatboxCleared = await page.evaluate(() => window.chatboxCleared || false);

		if (chatboxCleared) {
			await page.waitForFunction(() => {
				const chatbox = document.querySelector('.chatBox_messages');
				return chatbox && chatbox.children.length > 0;
			});

			await page.evaluate(() => window.chatboxCleared = false);
		};

		if (!chatboxCleared) {
			await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, '.input');

			await sendMessage(page, getMessage('greeting'));
			if (await checkSkipped(page) || !await waitForReply(page)) {
				await skipPerson(page);
				continue;
			};

			await sendMessage(page, getMessage('asking'));
			if (await checkSkipped(page) || !await waitForReply(page)) {
				await skipPerson(page);
				continue;
			};

			if (config.send_giving_and_ending_message_together) {
				await sendMessage(page, getMessage('giving'));
				await sendMessage(page, getMessage('ending'));
				await skipPerson(page);
			} else {
				await sendMessage(page, getMessage('giving'));
				if (await checkSkipped(page) || !await waitForReply(page)) {
					await skipPerson(page);
					continue;
				};
	
				await sendMessage(page, getMessage('ending'));
				await skipPerson(page);
			};

			await page.evaluate(() => window.chatboxCleared = false);
		};

		await delay(1000);
	};
};

(async () => {
	const browser = await puppeteer.launch({ headless: false });
	const page = await browser.newPage();

	await page.goto('https://omegleapp.me/chat');

	await page.evaluate(() => {
		window.addEventListener('beforeunload', (event) => {
			event.preventDefault();
			event.returnValue = '';
		});
	});

	skipPerson(page);
	await init(page);
})();
