// Được gọi khi add-on được cài đặt (installation trigger)
function onInstall(e) {
  onOpen(e);
}

// Được gọi khi mở tài liệu, để tạo menu cho add-on
function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu() // Sử dụng createAddonMenu() cho add-on
    .addItem("Open Translation Sidebar", "showSideBar")
    .addToUi();
}

// Hiển thị SideBar
function showSideBar() {
  var html = HtmlService.createHtmlOutputFromFile("Sidebar") // Tạo nội dung HTML từ file SideBar.html
    .setTitle("AI Translation Plugin"); // Đặt tiêu đề cho thanh bên
  DocumentApp.getUi().showSidebar(html); // Hiển thị thanh bên
}

// Mở hộp thoại dịch văn bản được chọn
function showMinimalTranslationDialog(config) {
  var doc = DocumentApp.getActiveDocument(); // Lấy văn bản hiện tại
  var selection = doc.getSelection(); // Lấy phần văn bản người dùng đang chọn
  var selectedText = ""; // Khởi tạo biến chứa đoạn văn đã chọn

  if (selection) {
    var elements = selection.getRangeElements(); // lấy danh sách các phần tử trong vùng được chọn
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i].getElement(); // lấy từng phần tử cụ thể
      if (element.editAsText) {
        // kiểm tra phần tử có thể chỉnh sửa dạng text không
        var textElement = element.asText(); // Chuyển sang đối tượng text
        selectedText +=
          textElement.getText().substring(
            elements[i].getStartOffset(), // vị trí bắt đầu trong đoạn text
            elements[i].getEndOffsetInclusive() + 1 // Vị trí kết thúc (bao gồm)
          ) + " ";
      }
    }
  }

  if (selectedText.trim() === "") {
    DocumentApp.getUi().alert("Please select some text to translate."); // cảnh báo nếu chưa chọn text
    return;
  }

  var template = HtmlService.createTemplateFromFile("MinimalDialog"); // tạo template dialog
  template.selectedText = selectedText.trim(); // gửi text vào trong template dialog
  template.sourceLang = config.sourceLang; // ngôn ngữ nguồn
  template.targetLang = config.targetLang; // ngôn ngữ đích
  template.model = config.model; // mô hình dịch
  template.temperature = config.temperature; // độ sáng tạo
  template.style = config.style || ""; // phong cách dịch

  var htmlOutput = template
    .evaluate() // chuyển template thành html
    .setWidth(600)
    .setHeight(300);
  DocumentApp.getUi().showModalDialog(htmlOutput, "Translate Selection"); // hiển thị dialog
}

// gọi hộp thoại từ giao diện sidebar
function triggerMinimalDialogFromSidebar(config) {
  showMinimalTranslationDialog(config);
}

function translateText(data) {
  const text = data.text; // văn bản cần dịch
  const sourceLang = data.sourceLang; // ngôn ngữ nguồn
  const targetLang = data.targetLang; // ngôn ngữ đích
  const model = data.model; // tên loại model AI
  const temperature = data.temperature; // độ sáng tạo
  const style = data.style || "";

  // Debug info
  Logger.log("Text to translate: " + text);
  Logger.log("Source Language: " + sourceLang);
  Logger.log("Target Language: " + targetLang);
  Logger.log("Model: " + model);
  Logger.log("Temperature: " + temperature);
  Logger.log("Style: " + style);

  const apiKey =
    PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"); // Lấy API keys
  if (!apiKey) {
    return "Error: API key chưa được thiết lập. Hãy vào Script Properties và thêm GEMINI_API_KEY.";
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`; // URL endpoint của Gemini API

  // Xây dựng prompt với phong cách tùy chọn
  let stylePrompt = "";
  if (style.toLowerCase() === "academic") {
    stylePrompt = " Use formal and academic language.";
  } else if (style.toLowerCase() === "professional") {
    stylePrompt =
      " Use a professional tone suitable for business or official communication.";
  } else if (style.toLowerCase() === "casual") {
    stylePrompt = " Use a casual, conversational tone.";
  }

  const prompt = `Translate the text below from ${sourceLang} to ${targetLang}.${stylePrompt}. Only return the translation exactly.\n\n${text}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: prompt, // Định dạng prompt theo yêu cầu của Gemini
          },
        ],
      },
    ],
    generationConfig: {
      temperature: temperature, // Cấu hình API
    },
  };

  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // không hiển thị lỗi hệ thống
  };

  try {
    const response = UrlFetchApp.fetch(endpoint, options); // Gửi POST request đến Gemini
    const result = JSON.parse(response.getContentText()); // Parse kết quả JSON

    Logger.log("Raw API Response: " + JSON.stringify(result)); // Thêm để xem phản hồi thô

    // Kiểm tra xem có kết quả hay không
    if (result && result.candidates && result.candidates.length > 0) {
      return result.candidates[0].content.parts[0].text; // Trả về kết quả dịch
    } else if (result.error) {
      return `Error from Gemini: ${result.error.message}`; // Trả về lỗi từ API
    } else {
      return "Không có bản dịch nào được trả về."; // Trường hợp không có phản hồi
    }
  } catch (e) {
    return "Lỗi khi gọi API Gemini: " + e.toString(); // Lỗi khi gửi request
  }
}

// Thay thế văn bản đã chọn bằng bản dịch
function replaceSelectedText(newText) {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    DocumentApp.getUi().alert("No text selected to replace.");
    Logger.log("No selection detected.");
    return;
  }

  Logger.log("New translated text to insert: " + newText);

  // Làm sạch văn bản (loại bỏ \n xuống dòng)
  newText = newText.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const elements = selection.getRangeElements();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const element = el.getElement();

    if (element.editAsText && !el.isPartial()) {
      element.setText(newText);
      element.setBackgroundColor("#fff3b0"); // Highlight toàn đoạn
      Logger.log("Replaced full paragraph with new text and highlighted.");
    } else if (element.editAsText) {
      const text = element.asText();
      const start = el.getStartOffset();
      const end = el.getEndOffsetInclusive();

      Logger.log(`Replacing text at offsets [${start}, ${end}]`);

      text.deleteText(start, end);
      text.insertText(start, newText);
      // Highlight vùng vừa chèn (sử dụng length của đoạn mới)
      text.setBackgroundColor(start, start + newText.length - 1, "#fff3b0");

      Logger.log("Inline replacement with highlight complete.");
    }
  }
}

function translateFullDocument(config) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  // Lấy toàn bộ văn bản (plain text)
  const fullText = body.getText();

  // Dịch văn bản thông qua hàm translateText đã có
  const translation = translateText({
    text: fullText,
    sourceLang: config.sourceLang,
    targetLang: config.targetLang,
    model: config.model,
    temperature: config.temperature,
  });

  // Chèn tiêu đề cho phần dịch với một icon và định dạng đẹp
  var header = body.appendParagraph("🌐 Translated Text");
  header.setBold(true);
  header.setForegroundColor("#3498db");
  header.setFontSize(16);
  header.setSpacingBefore(10);
  header.setSpacingAfter(5);

  // Tìm một đoạn tham chiếu định dạng (ví dụ: đoạn cuối cùng của văn bản gốc)
  var paragraphs = body.getParagraphs();
  var refAttributes = {};
  if (paragraphs.length > 0) {
    refAttributes = paragraphs[paragraphs.length - 1].getAttributes();
  }

  // Chèn đoạn văn bản dịch vào cuối tài liệu
  var translationPara = body.appendParagraph(translation);
  // Áp dụng các thuộc tính định dạng của đoạn tham chiếu để giữ format
  translationPara.setAttributes(refAttributes);

  return "Translation complete";
}
