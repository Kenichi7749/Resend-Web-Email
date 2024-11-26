const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bodyParser = require("body-parser");
const { Resend } = require("resend");
const path = require("path");

// 解析命令行参数
const args = process.argv.slice(2); // 获取命令行参数
let apiKey = null;

// 查找 --api-key 参数
args.forEach((arg, index) => {
  if (arg === "--api-key" && args[index + 1]) {
    apiKey = args[index + 1]; // 获取 apiKey
  }
});

// 如果没有提供 apiKey，打印错误并退出
if (!apiKey) {
  console.error("錯誤：API 金鑰是必需的。請使用 --api-key <key> 提供它。");
  process.exit(1); // 退出程序，返回错误代码
}

// 初始化 Resend
const resend = new Resend(apiKey);  // 使用从命令行传入的 apiKey

// 初始化 Express
const app = express();

// 启用 CORS
app.use(cors());

// 配置 multer，限制文件大小为 8MB
const upload = multer({
  limits: { fileSize: 8 * 1024 * 1024 }, // 单文件最大为 8 MB
});

// 静态文件服务
app.use(express.static("public"));

// 解析表单数据
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 处理多附件邮件发送
app.post("/send-email", upload.array("attachments"), async (req, res) => {
  const { nickname, fromEmail, toEmail, subject, textContent } = req.body;
  const files = req.files;

  // 验证必填字段
  if (!nickname || !fromEmail || !toEmail || !subject) {
    return res.status(400).json({ message: "缺少必要的字段，请检查输入。" });
  }

  const from = `${nickname} <${fromEmail}>`;
  const to = [toEmail];
  let attachments = [];

  // 处理附件，解决中文文件名乱码
  if (files && files.length > 0) {
    attachments = files.map((file) => {
      const filename = Buffer.from(file.originalname, "latin1").toString("utf8"); // 修正中文乱码
      return {
        filename,
        content: file.buffer.toString("base64"),
        encoding: "base64",
      };
    });
  }

  try {
    // 发送邮件
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: textContent ? `<p>${textContent}</p>` : "",
      attachments,
    });

    if (error) {
      return res.status(400).json({ message: "邮件发送失败", error });
    }

    res.json({ message: "邮件发送成功", data });
  } catch (err) {
    res.status(500).json({ message: "服务器错误", error: err.message });
  }
});

// 全局错误处理（包括文件上传相关错误）
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // 文件上传错误处理
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "文件大小不能超过 8MB" });
    }
    return res.status(400).json({ message: `文件上传错误: ${err.message}` });
  } else if (err) {
    // 其他错误处理
    return res.status(400).json({ message: err.message });
  }
  next();
});

// 设置静态文件目录
app.use(express.static(path.join(__dirname, "public")));

// Web Email 页面
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`服务器运行于 http://localhost:${PORT}`);
});
