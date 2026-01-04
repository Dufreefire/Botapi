const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Tesseract = require('tesseract.js');

puppeteer.use(StealthPlugin());
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/zefoy', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Thiếu link TikTok (?url=...)" });

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        console.log("🚀 Đang truy cập Zefoy...");
        await page.goto('https://zefoy.com/', { waitUntil: 'networkidle2', timeout: 60000 });

        // --- BƯỚC 1: GIẢI CAPTCHA ---
        const captchaSelector = 'img.img-thumbnail';
        await page.waitForSelector(captchaSelector, { timeout: 10000 });
        const captchaImg = await page.$(captchaSelector);
        const buffer = await captchaImg.screenshot();

        console.log("🧠 AI đang đọc Captcha...");
        const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
        const captchaText = text.trim().replace(/\s/g, "");
        console.log("📝 Kết quả AI:", captchaText);

        await page.type('input[placeholder="Enter the word"]', captchaText);
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 5000));

        // --- BƯỚC 2: TÌM NÚT HEARTS ---
        const buttons = await page.$$('button.btn-primary');
        let heartBtn = null;
        for (let btn of buttons) {
            const btnText = await page.evaluate(el => el.innerText, btn);
            if (btnText.includes('Hearts')) { heartBtn = btn; break; }
        }

        if (!heartBtn) {
            const isSoon = await page.evaluate(() => document.body.innerText.includes('Soon'));
            throw new Error(isSoon ? "Dịch vụ Tim đang bảo trì (Soon)." : "Giải Captcha sai.");
        }

        await heartBtn.click();
        await new Promise(r => setTimeout(r, 2000));

        // --- BƯỚC 3: NHẬP LINK VÀ BUFF ---
        await page.waitForSelector('input[type="url"]');
        await page.type('input[type="url"]', videoUrl);
        await page.click('button.btn-search');
        
        console.log("⏳ Chờ Zefoy xử lý...");
        await new Promise(r => setTimeout(r, 8000));

        const sendBtn = await page.$('.btn-send');
        if (sendBtn) {
            await sendBtn.click();
            res.json({ status: "success", message: "Đã gửi tim thành công!" });
        } else {
            res.json({ status: "fail", message: "Đang cooldown hoặc lỗi giao diện." });
        }

    } catch (e) {
        console.error("❌ Lỗi:", e.message);
        res.status(500).json({ status: "error", message: e.message });
    } finally {
        if (browser) {
            await browser.close();
            console.log("🛑 Đã đóng trình duyệt.");
        }
    }
});

app.listen(PORT, () => console.log(`API đang chạy tại port ${PORT}`));
