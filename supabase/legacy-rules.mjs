import { ManilaDate as Date } from './manila-date.mjs';
import { currentRows, SpreadsheetApp, Utilities, Session, PropertiesService } from './rules-environment.mjs';
// Business rules extracted from the current user-supplied Code.gs.
function parseExpense(text) {

  var original = text.trim();

  var lower = original
    .toLowerCase()
    .replace(/₱/g, " peso ")
    .replace(/\s+/g, " ")
    .trim();


  // =======================================================
  // AMOUNT
  // =======================================================

  var amount = extractAmount(lower);


  // =======================================================
  // PAYMENT METHOD
  // =======================================================

  var payment = detectPaymentMethod(lower);


  // =======================================================
  // CATEGORY
  // =======================================================

  var category = detectExpenseCategory(lower);


  // =======================================================
  // MERCHANT
  // =======================================================

  var merchant = extractMerchant(original);


  // =======================================================
  // DESCRIPTION
  // =======================================================

  var description = extractDescription(original);


  // If merchant wasn't detected, try known merchants
  if (!merchant) {
    merchant = detectKnownMerchant(original);
  }

  if (!description && !merchant) {
    description = extractSimpleMoneyFlowDescription(original);
  }


  // Clean merchant
  merchant = cleanMerchant(merchant);


  // Clean description
  description = cleanDescription(description);


  return {
    amount: amount,
    merchant: merchant,
    description: description,
    category: category,
    payment: payment
  };
}

function extractAmount(text) {

  var amount = 0;


  // Examples:
  // 350 pesos
  // 350 peso
  // php 350
  // p350
  // ₱350 gets converted to "peso 350"

  var patterns = [

    /(?:php|peso|pesos|p)\s*([0-9,]+(?:\.[0-9]+)?)/i,

    /([0-9,]+(?:\.[0-9]+)?)\s*(?:php|peso|pesos)/i

  ];


  for (var i = 0; i < patterns.length; i++) {

    var match = text.match(patterns[i]);

    if (match) {

      amount = parseFloat(
        match[1].replace(/,/g, "")
      );

      if (!isNaN(amount)) {
        return amount;
      }
    }
  }


  // -------------------------------------------------------
  // Handle shorthand:
  //
  // 2k
  // 1.5k
  // 2.5k
  // -------------------------------------------------------

  var kMatch = text.match(
    /\b([0-9]+(?:\.[0-9]+)?)\s*k\b/i
  );

  if (kMatch) {

    amount = parseFloat(kMatch[1]) * 1000;

    if (!isNaN(amount)) {
      return amount;
    }
  }


  // -------------------------------------------------------
  // Last resort: first reasonable number
  // -------------------------------------------------------

  var numberMatches = text.match(
    /\b[0-9,]+(?:\.[0-9]+)?\b/g
  );


  if (numberMatches) {

    for (var j = 0; j < numberMatches.length; j++) {

      var possibleAmount = parseFloat(
        numberMatches[j].replace(/,/g, "")
      );


      if (
        !isNaN(possibleAmount) &&
        possibleAmount > 0
      ) {
        return possibleAmount;
      }
    }
  }


  return 0;
}

function detectPaymentMethod(text) {

  var lower = text.toLowerCase();


  // =======================================================
  // SHORT CREDIT CARD CODES
  // =======================================================

  var cardCodes = {
    "mbcc": "Metrobank Credit Card",
    "ewcc": "EastWest Credit Card",
    "bpicc": "BPI Credit Card",
    "bdocc": "BDO Credit Card",
    "ubcc": "UnionBank Credit Card",
    "rcbccc": "RCBC Credit Card",
    "sbcc": "Security Bank Credit Card",
    "pnbcc": "PNB Credit Card",
    "hsbccc": "HSBC Credit Card",
    "cbcc": "Chinabank Credit Card",
    "maybankcc": "Maybank Credit Card"
  };

  for (var code in cardCodes) {
    var regex = new RegExp("\\b" + code + "\\b", "i");

    if (regex.test(lower)) {
      return cardCodes[code];
    }
  }


  // =======================================================
  // BANK + "PAYMENT"
  // Example:
  // "Metrobank payment" = Metrobank Credit Card
  // =======================================================

  if (/\bmetrobank payment\b|\bmetro bank payment\b/i.test(lower))
    return "Metrobank Credit Card";

  if (/\beastwest payment\b|\beast west payment\b/i.test(lower))
    return "EastWest Credit Card";

  if (/\bbpi payment\b/i.test(lower))
    return "BPI Credit Card";

  if (/\bbdo payment\b/i.test(lower))
    return "BDO Credit Card";

  if (/\bunionbank payment\b|\bunion bank payment\b/i.test(lower))
    return "UnionBank Credit Card";

  if (/\brcbc payment\b/i.test(lower))
    return "RCBC Credit Card";

  if (/\bsecurity bank payment\b/i.test(lower))
    return "Security Bank Credit Card";

  if (/\bpnb payment\b/i.test(lower))
    return "PNB Credit Card";

  if (/\bhsbc payment\b/i.test(lower))
    return "HSBC Credit Card";

  if (/\bchinabank payment\b|\bchina bank payment\b/i.test(lower))
    return "Chinabank Credit Card";

  if (/\bmaybank payment\b/i.test(lower))
    return "Maybank Credit Card";
    


  // =======================================================
  // NORMAL CREDIT CARD SPEECH
  //
  // Examples:
  // Metrobank CC
  // Metrobank Credit Card
  // BPI card
  // =======================================================

  var isCreditCard =
    /\bcredit card\b|\bcc\b|\bcard\b/i.test(lower);

  if (isCreditCard) {

    if (/\bmetrobank\b|\bmetro bank\b/i.test(lower))
      return "Metrobank Credit Card";

    if (/\beastwest\b|\beast west\b/i.test(lower))
      return "EastWest Credit Card";

    if (/\bbpi\b/i.test(lower))
      return "BPI Credit Card";

    if (/\bbdo\b/i.test(lower))
      return "BDO Credit Card";

    if (/\bunionbank\b|\bunion bank\b|\bub\b/i.test(lower))
      return "UnionBank Credit Card";

    if (/\brcbc\b/i.test(lower))
      return "RCBC Credit Card";

    if (/\bsecurity bank\b/i.test(lower))
      return "Security Bank Credit Card";

    if (/\bpnb\b/i.test(lower))
      return "PNB Credit Card";

    if (/\bhsbc\b/i.test(lower))
      return "HSBC Credit Card";

    if (/\bchinabank\b|\bchina bank\b/i.test(lower))
      return "Chinabank Credit Card";

    if (/\bmaybank\b/i.test(lower))
      return "Maybank Credit Card";

    return "Credit Card";
  }


  // =======================================================
  // E-WALLETS
  // =======================================================

  if (/\bgcash\b/i.test(lower))
    return "GCash";

  if (/\bmaya\b|\bpaymaya\b/i.test(lower))
    return "Maya";


  // =======================================================
  // CASH
  // =======================================================

  if (/\bcash\b|\bpera\b/i.test(lower))
    return "Cash";


  // =======================================================
  // DEBIT CARD
  // =======================================================

  if (/\bdebit\b|\bdebit card\b/i.test(lower)) {

    if (/\bmetrobank\b|\bmetro bank\b/i.test(lower))
      return "Metrobank Debit Card";

    if (/\bbpi\b/i.test(lower))
      return "BPI Debit Card";

    if (/\bbdo\b/i.test(lower))
      return "BDO Debit Card";

    if (/\bunionbank\b|\bunion bank\b/i.test(lower))
      return "UnionBank Debit Card";

    return "Debit Card";
  }


  // =======================================================
  // DIGITAL BANKS
  // =======================================================

  if (/\bgotyme\b|\bgo tyme\b/i.test(lower))
    return "GoTyme";

  if (/\bseabank\b|\bsea bank\b/i.test(lower))
    return "SeaBank";


  return "";
}

function detectExpenseCategory(text) {


// =======================================================
// INCOME
// =======================================================

if (
  /\bincome\b|\bkita\b|\bsweldo\b|\bsalary\b|\bearnings\b/i.test(text)
) {
  return "Income";
}

  // =======================================================
  // FOOD
  // =======================================================

  if (
    /\bjabi\b|jollibee|mcdo|mcdonald|chowking|mang inasal|kfc|starbucks|coffee|restaurant|food|lunch|dinner|breakfast|merienda|snack|pagkain|ulam|kain/i.test(text)
  ) {
    return "Food";
  }


  // =======================================================
  // GROCERIES
  // =======================================================

  if (
    /grocery|groceries|groceryhan|supermarket|puregold|savemore|sm supermarket|waltermart|robinsons supermarket|marketplace|palengke/i.test(text)
  ) {
    return "Groceries";
  }


  // =======================================================
  // REPAIR & MAINTENANCE
  // =======================================================

  if (
    /repair|maintenance|maintain|fix|fixed|pagawa|pinagawa|ipaayos|ayos|sira|service|labor|change oil|oil change|tire|tyre|vulcanizing|mechanic|mekaniko|spare parts|replacement parts|parts/i.test(text)
  ) {
    return "Repair & Maintenance";
  }


  // =======================================================
  // TRANSPORTATION
  // =======================================================

  if (
    /grab|angkas|joyride|move it|taxi|tricycle|trike|jeep|jeepney|bus|train|lrt|mrt|pamasahe|fare|transport|gasoline|gas|fuel|diesel|parking|toll/i.test(text)
  ) {
    return "Transportation";
  }


  // =======================================================
  // BILLS
  // =======================================================

  if (
    /kuryente|electricity|electric bill|meralco|tubig|water bill|maynilad|manila water|internet|wifi|pldt|globe fiber|converge|rent|upa|bill|bills/i.test(text)
  ) {
    return "Bills";
  }


  // =======================================================
  // SHOPPING
  // =======================================================

  if (
  /shopee|lazada|tiktok|tik tok|tiktok shop|tik tok shop|shopping|clothes|damit|shirt|pants|shoes|sapatos|bag|gadget|accessories/i.test(text)
) {
  return "Shopping";
}


  // =======================================================
  // HEALTH
  // =======================================================

  if (
    /medicine|gamot|pharmacy|mercury drug|watsons|doctor|hospital|clinic|checkup|check up|medical|health/i.test(text)
  ) {
    return "Health";
  }


  // =======================================================
  // SUBSCRIPTIONS
  // =======================================================

  if (
    /netflix|spotify|youtube premium|disney|subscription|icloud|google one|canva|microsoft 365/i.test(text)
  ) {
    return "Subscriptions";
  }


  // =======================================================
  // PERSONAL CARE
  // =======================================================

  if (
    /haircut|barber|salon|shampoo|soap|toiletries|personal care|skincare|skin care/i.test(text)
  ) {
    return "Personal Care";
  }


  // =======================================================
  // ENTERTAINMENT
  // =======================================================

  if (
    /movie|cinema|concert|game|gaming|steam|playstation|entertainment/i.test(text)
  ) {
    return "Entertainment";
  }

  return "Other";
}

function extractMerchant(text) {

  var merchant = "";


  // -------------------------------------------------------
  // English:
  // "at Jollibee"
  //
  // Tagalog:
  // "sa Jollibee"
  //
  // Stop before:
  // for
  // para
  // para sa
  // paid
  // gamit
  // using
  // amount
  // comma
  // -------------------------------------------------------

  var match = text.match(
    /\b(?:at|sa)\s+(.+?)(?=\s+(?:for|para|para sa|paid|bayad|using|gamit|via)\b|,|$)/i
  );


  if (match) {

    merchant = match[1].trim();

    // Don't treat generic phrases as merchant
    if (
      /^(lunch|dinner|breakfast|food|pagkain|pamasahe|kuryente|tubig)$/i.test(merchant)
    ) {
      merchant = "";
    }
  }


  return merchant;
}

function extractDescription(text) {

  var description = "";


  // English:
  // "for lunch"
  //
  // Tagalog:
  // "para sa lunch"
  // "para lunch"

  var match = text.match(
    /\b(?:for|para sa|para)\s+(.+?)(?=\s+(?:paid|bayad|using|gamit|via)\b|,|$)/i
  );


  if (match) {
    description = match[1].trim();
  }


  return description;
}

function detectKnownMerchant(text) {

  // =======================================================
  // MERCHANT SHORTCUTS
  // =======================================================

  if (/\bjabi\b/i.test(text))
    return "Jollibee";

  if (/\bmcdo\b/i.test(text))
    return "McDonald's";


  // Your existing merchant list continues below...
  var merchants = [
  "Jollibee",
  "McDonald's",
  "McDo",
  "Chowking",
  "Mang Inasal",
  "KFC",
  "Starbucks",
  "Puregold",
  "Savemore",
  "SM Supermarket",
  "Robinsons Supermarket",
  "WalterMart",
  "Shopee",
  "Lazada",
  "TikTok",
  "TikTok Shop",
  "Grab",
  "Angkas",
  "JoyRide",
  "Move It",
  "Mercury Drug",
  "Watsons",
  "Meralco",
  "Maynilad",
  "Manila Water",
  "PLDT",
  "Converge",
  "Globe",
  "Netflix",
  "Spotify"
];

  for (var i = 0; i < merchants.length; i++) {

    var merchant = merchants[i];

    var regex = new RegExp(
      merchant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    if (regex.test(text)) {
      return merchant;
    }
  }

  return "";
}

function extractSimpleMoneyFlowDescription(text) {
  var description = String(text || "")
    .replace(/₱?\s*\d[\d,]*(?:\.\d+)?/g, " ")
    .replace(/\b(?:php|peso|pesos|cash|gcash|maya|paymaya|income|expense)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "")
    .trim();

  if (!description) return "";

  return description.charAt(0).toUpperCase() + description.slice(1);
}

function cleanMerchant(merchant) {

  if (!merchant) return "";


  merchant = merchant
    .replace(/\b(?:ng|mga)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();


  return merchant;
}

function cleanDescription(description) {

  if (!description) return "";


  return description
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMoneyFlowCategory(parsedCategory, entryType) {
  if (String(entryType || "").toLowerCase() === "income") {
    return "Income";
  }

  return parsedCategory || "Other";
}

function parseRentalEntry_(text, category, entryType) {
  var raw = String(text || "").trim();
  var amountMatch = raw.match(/(?:₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!amountMatch) throw new Error("Enter the rental amount.");
  var amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!isFinite(amount) || amount <= 0) throw new Error("Invalid rental amount.");
  var categories = { "insta360": "Insta360", "chair & table": "Chair & Table" };
  var cleanCategory = categories[String(category || "").trim().toLowerCase()];
  if (!cleanCategory) throw new Error("Choose Insta360 or Chair & Table.");
  var type = String(entryType || "").trim().toLowerCase();
  if (type !== "income" && type !== "expense") throw new Error("Choose Income or Expense.");
  var description = toTitleCase_(raw.replace(amountMatch[0], "").replace(/\s+/g, " ").trim());
  return { amount: Math.round(amount * 100) / 100, category: cleanCategory, type: type === "income" ? "Income" : "Expense", description: description };
}

function toTitleCase_(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, function(match, space, letter) {
      return space + letter.toUpperCase();
    });
}

function parseTwiceAsNyceEntry_(text, category) {

  var rawText =
    String(text || "").trim();

  if (!rawText) {
    throw new Error(
      "Enter a TwiceAsNyce transaction."
    );
  }

  var categoryKey =
    String(category || "")
      .trim()
      .toLowerCase();

  var categoryMap = {
    income: "Income",
    expense: "Expense"
  };

  if (!categoryMap[categoryKey]) {
    throw new Error(
      "Choose Income or Expense."
    );
  }

  var amountMatch =
    rawText.match(
      /(?:₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/
    );

  if (!amountMatch) {
    throw new Error(
      "Amount not found."
    );
  }

  var amount =
    Number(
      amountMatch[1]
        .replace(/,/g, "")
    );

  if (
    !isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount."
    );
  }

  amount =
    Math.round(amount * 100) / 100;

  var description =
    rawText
      .replace(amountMatch[0], "")
      .replace(/\s+/g, " ")
      .trim();

  return {
    amount: amount,
    category: categoryMap[categoryKey],
    description: description
  };
}

function parsePrintingEntry_(text, category) {

  var rawText =
    String(text || "").trim();

  if (!rawText) {
    throw new Error(
      "Enter a printing transaction."
    );
  }

  var categoryKey =
    String(category || "")
      .trim()
      .toLowerCase();

  var categoryMap = {
    income: "Income",
    expense: "Expense"
  };

  if (!categoryMap[categoryKey]) {
    throw new Error(
      "Choose Income or Expense."
    );
  }

  var amountMatch =
    rawText.match(
      /(?:₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/
    );

  if (!amountMatch) {
    throw new Error(
      "Amount not found."
    );
  }

  var amount =
    Number(
      amountMatch[1]
        .replace(/,/g, "")
    );

  if (
    !isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount."
    );
  }

  amount =
    Math.round(amount * 100) / 100;

  var description =
    expandPrintingDescriptionShortcut_(rawText
      .replace(
        amountMatch[0],
        ""
      )
      .replace(/\s+/g, " ")
      .trim());

  return {
    amount: amount,
    category:
      categoryMap[categoryKey],
    description: description
  };
}

function expandPrintingDescriptionShortcut_(description) {
  var normalized = String(description || "").trim().toLowerCase();
  var shortcuts = { re: "Receipt", pr: "Print", xe: "Xerox" };
  return shortcuts[normalized] || toTitleCase_(description);
}

function parseTestCashOutInput_(text) {
  var raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) throw new Error('Enter customer and cash-out amount.');

  var tokenRegex = /(?:^|\s)(?:₱\s*)?(\d+(?:\.\d+)?)(k)?(?=\s|$)/i;
  var match = raw.match(tokenRegex);
  if (!match) throw new Error('Cash-out amount not found.');

  var amount = Number(match[1]);
  if (match[2]) amount *= 1000;

  var customer = (raw.slice(0, match.index) + ' ' + raw.slice(match.index + match[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  if (!customer) throw new Error('Customer name is required.');

  return { customer: toTitleCase_(customer), amount: amount };
}

function parseTestAapInput_(text) {
  var raw = String(text || '').replace(/\s+/g, ' ').trim();
  var match = raw.match(/^([\d,]+(?:\.\d{1,2})?)\s+(?:₱\s*)?([\d,]+(?:\.\d{1,2})?)$/);
  if (!match) throw new Error('Enter people and total received, including fees, in either order. Example: 35 30000.');

  var first = Number(match[1].replace(/,/g, ''));
  var second = Number(match[2].replace(/,/g, ''));
  var people = Math.min(first, second);
  var totalReceived = Math.max(first, second);
  if (!isFinite(people) || people <= 0 || people % 1 !== 0) {
    throw new Error('Number of people must be a whole number greater than 0.');
  }
  if (!isFinite(totalReceived) || totalReceived <= people * TEST_AAP_FEE_PER_PERSON_) {
    throw new Error('Total received must be greater than the total fee.');
  }
  return { people: people, bookTotal: totalReceived - people * TEST_AAP_FEE_PER_PERSON_ };
}

var TEST_AAP_FEE_PER_PERSON_ = 5;

function calculateTestAap_(people, bookTotal) {
  var count = Number(people);
  var book = Number(bookTotal);
  if (!isFinite(count) || count <= 0 || count % 1 !== 0) {
    throw new Error('Number of people must be a whole number greater than 0.');
  }
  if (!isFinite(book) || book <= 0) {
    throw new Error('Book total must be greater than 0.');
  }

  var totalFee = count * 5;
  var systemFee = count * 2;
  var feeEarned = count * 3;
  return {
    customer: TEST_AAP_CUSTOMER_,
    people: count,
    bookTotal: book,
    totalFee: totalFee,
    systemFee: systemFee,
    feeEarned: feeEarned,
    cashReceived: book + totalFee,
    appDeduction: book + systemFee
  };
}

var TEST_AAP_CUSTOMER_ = 'Batasan M3';

function buildTestAapRow_(now, calculation, destination) {
  var target = normalizeTestAapDestination_(destination);
  return [
    now,
    now,
    TEST_AAP_CUSTOMER_,
    calculation.cashReceived,
    calculation.feeEarned,
    'Collection',
    buildTestAapDescription_(calculation, target)
  ];
}

function normalizeTestAapDestination_(destination) {
  var value = String(destination || 'cash').trim().toLowerCase();
  if (value !== 'cash' && value !== 'gcash') {
    throw new Error('Choose Cash Collection or GCash Collection.');
  }
  return value;
}

function buildTestAapDescription_(calculation, destination) {
  var target = normalizeTestAapDestination_(destination);
  var label = target === 'gcash' ? 'GCash' : 'Cash';
  return 'AAP ' + label + ' — ' + calculation.people +
    ' people, ₱' + formatTestAapDescriptionAmount_(calculation.bookTotal) +
    ' book, ₱' + formatTestAapDescriptionAmount_(calculation.totalFee) +
    ' total fee';
}

function formatTestAapDescriptionAmount_(value) {
  var number = Number(value);
  var parts = number.toFixed(number % 1 === 0 ? 0 : 2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function parseTestTransferInput_(text) {
  var raw = String(text || '').replace(/₱/g, '').replace(/,/g, '').trim();
  var parts = raw ? raw.split(/\s+/) : [];
  if (parts.length < 1 || parts.length > 2) {
    throw new Error('Enter one amount, or amount and people for AAP.');
  }
  var values = parts.map(parseTestTransferNumber_);
  for (var i = 0; i < values.length; i++) {
    if (!isFinite(values[i]) || values[i] <= 0) {
      throw new Error('Enter numbers greater than 0.');
    }
  }
  if (values.length === 1) {
    return { mode: 'normal', amount: values[0], people: 0, bookTotal: 0 };
  }

  var candidates = [];
  function addCandidate(amount, people) {
    if (people === Math.floor(people) && amount > people * TEST_AAP_FEE_PER_PERSON_) {
      candidates.push({
        mode: 'aap',
        amount: amount,
        people: people,
        bookTotal: amount - people * TEST_AAP_FEE_PER_PERSON_
      });
    }
  }
  addCandidate(values[0], values[1]);
  addCandidate(values[1], values[0]);
  if (candidates.length !== 1) {
    throw new Error('AAP input must contain one total amount and one people count.');
  }
  return candidates[0];
}

function parseTestTransferNumber_(value) {
  var token = String(value || '').trim().toLowerCase();
  var kMatch = token.match(/^([0-9]+(?:\.[0-9]+)?)k$/);
  return kMatch ? Number(kMatch[1]) * 1000 : Number(token);
}

function buildTestTransferInputRow_(now, parsedTransfer, direction) {
  var normalized = normalizeTestTransferDirection_(direction);
  if (parsedTransfer.mode === 'aap') {
    if (normalized !== 'gcashToCard') {
      throw new Error('AAP transfer is only available for GCash to Card.');
    }
    return buildTestGcashAapProcessingRow_(
      now,
      calculateTestAap_(parsedTransfer.people, parsedTransfer.bookTotal)
    );
  }
  return buildTestTransferRow_(now, parsedTransfer.amount, normalized);
}

function normalizeTestTransferDirection_(direction) {
  var value = String(direction || '').trim();
  var descriptions = {
    cashToGcash: 'Cash to GCash',
    gcashToCard: 'GCash to Card',
    cardToGcash: 'Card to GCash',
    gcashToCash: 'GCash to Cash',
    nanayToCash: 'Nanay to Cash',
    cashToNanay: 'Cash to Nanay'
  };
  if (!descriptions[value]) throw new Error('Choose a valid transfer direction.');
  return value;
}

function buildTestGcashAapProcessingRow_(now, summary) {
  return [
    now,
    now,
    'Transfer',
    Number(summary.cashReceived),
    Number(summary.feeEarned),
    'Transfer',
    buildTestGcashAapProcessingDescription_(summary)
  ];
}

function buildTestGcashAapProcessingDescription_(summary) {
  return 'AAP GCash to Card — ' + summary.people +
    ' people, ₱' + formatTestAapDescriptionAmount_(summary.bookTotal) +
    ' book, ₱' + formatTestAapDescriptionAmount_(summary.totalFee) +
    ' total fee';
}

function buildTestTransferRow_(now, amount, direction) {
  var transferAmount = validateTestTransferAmount_(amount);
  var normalized = normalizeTestTransferDirection_(direction);
  var descriptions = {
    cashToGcash: 'Cash to GCash',
    gcashToCard: 'GCash to Card',
    cardToGcash: 'Card to GCash',
    gcashToCash: 'GCash to Cash',
    nanayToCash: 'Nanay to Cash',
    cashToNanay: 'Cash to Nanay'
  };
  return [now, now, 'Transfer', transferAmount, '', 'Transfer', descriptions[normalized]];
}

function validateTestTransferAmount_(amount) {
  var value = Number(amount);
  if (!isFinite(value) || value <= 0) {
    throw new Error('Transfer amount must be greater than 0.');
  }
  return value;
}

function parseTestOthersLoanInput_(text, action) {
  var raw = String(text || '').replace(/₱/g, '').replace(/,/g, '').trim();
  var normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction !== 'add' && normalizedAction !== 'minus') {
    throw new Error('Choose ADD LOAN or MINUS LOAN.');
  }
  if (!raw) throw new Error('Enter the loan amount.');

  var tokens = raw.split(/\s+/);
  var numbers = [];
  var lenderParts = [];
  for (var i = 0; i < tokens.length; i++) {
    var parsedNumber = parseTestTransferNumber_(tokens[i]);
    if (isFinite(parsedNumber) && parsedNumber > 0) numbers.push(parsedNumber);
    else lenderParts.push(tokens[i]);
  }

  if (normalizedAction === 'minus' && numbers.length !== 1) {
    throw new Error('MINUS LOAN needs one payment amount.');
  }
  if (normalizedAction === 'add' && (numbers.length < 1 || numbers.length > 2)) {
    throw new Error('ADD LOAN needs a loan amount and optional fee.');
  }

  var principal = Math.max.apply(Math, numbers);
  var fee = normalizedAction === 'add' && numbers.length === 2
    ? Math.min.apply(Math, numbers)
    : 0;
  if (fee >= principal) throw new Error('Loan fee must be lower than the loan amount.');

  return {
    action: normalizedAction,
    principal: principal,
    fee: fee,
    amount: principal,
    lender: lenderParts.join(' ').trim(),
    netToCard: normalizedAction === 'add' ? principal - fee : -principal
  };
}

function buildTestOthersLoanRow_(now, entry) {
  var lender = entry.lender || 'Other';
  var description = entry.action === 'add'
    ? 'Others Loan Add | ' + lender + ' | Fee ' + entry.fee
    : 'Others Loan Minus | ' + lender;
  return [now, now, 'Others Loan', entry.principal, '', 'Transfer', description];
}

function buildTestLoanRows_(now, amount, rebate) {
  return [
    [now, now, 'Me', amount, '', 'Expense', 'Loan payment'],
    [now, now, 'Me', rebate, '', 'Income', 'Loan rebate']
  ];
}

function validateTestLoanAmount_(amount, rebate) {
  var value = amount === undefined || amount === null || String(amount).trim() === '' ? 415 : Number(amount);
  var rebateValue = rebate === undefined || rebate === null || String(rebate).trim() === '' ? 50 : Number(rebate);
  if (!isFinite(value) || !isFinite(rebateValue) || rebateValue <= 0 || value <= rebateValue ||
      Math.round(value * 100) !== value * 100 || Math.round(rebateValue * 100) !== rebateValue * 100) {
    throw new Error('Loan payment must be greater than the rebate. Both need valid amounts with at most two decimal places.');
  }
  return { payment: value, rebate: rebateValue };
}

function validateTestAtmAmount_(amount) {
  var value = Number(amount);
  if (value < 1000 || value > 10000 || value % 1000 !== 0) {
    throw new Error('ATM withdrawal must be ₱1,000 to ₱10,000 in ₱1,000 steps.');
  }
  return value;
}

function buildTestAtmRow_(now, amount) {
  return [now, now, 'ATM', Number(amount), '', 'Transfer', 'ATM withdrawal'];
}

function computeTestDashboardFromRows_(rows, liveStartAt, asOfDate) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var liveStartMs = getKonek2CardEffectiveStartMs_(liveStartAt);
  var currentDate = asOfDate instanceof Date ? asOfDate : new Date();
  var liveRows = [];

  for (var liveIndex = 0; liveIndex < sourceRows.length; liveIndex++) {
    var liveTimestamp = getTestRowTimestamp_(sourceRows[liveIndex]);
    if (!isNaN(liveTimestamp) && !isNaN(liveStartMs) && liveTimestamp >= liveStartMs) {
      liveRows.push(sourceRows[liveIndex]);
    }
  }

  var totalEarned = 0;
  var thisWeekEarned = 0;
  var boundaryFound = false;

  for (var i = 0; i < liveRows.length; i++) {
    var fee = getTestEarnedFeeValue_(liveRows[i]);
    var earnedTimestamp = getTestRowTimestamp_(liveRows[i]);
    if (!isNaN(earnedTimestamp)) totalEarned += fee;

    if (!boundaryFound) {
      if (isTestLoanPaymentRow_(liveRows[i])) {
        boundaryFound = true;
      } else {
        thisWeekEarned += fee;
      }
    }
  }

  var events = [];
  var balanceResetMs = TEST_BALANCE_RESET_AT_.getTime();
  for (var j = 0; j < liveRows.length; j++) {
    var ts = getTestRowTimestamp_(liveRows[j]);
    if (isNaN(ts) || ts < balanceResetMs) continue;
    events.push({ row: liveRows[j], ts: ts, index: j });
  }

  events.sort(function(a, b) {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.index - b.index;
  });

  var gcash = TEST_START_GCASH_;
  // Keep the verified bank starting balance fixed as the starting hold changes.
  // Replay bank transactions, then subtract the current hold once to show
  // spendable Card money.
  var card = TEST_START_BANK_CARD_;
  var cashOnHand = TEST_START_CASH_ON_HAND_;
  var loanRemaining = TEST_START_LOAN_REMAINING_;
  var utangKayNanay = 0;
  var othersLoan = TEST_START_OTHERS_LOAN_;
  var heldMoney = TEST_START_HELD_MONEY_;

  for (var k = 0; k < events.length; k++) {
    var row = events[k].row;
    var amount = Number(row[3] || 0);
    var feeEarned = getTestEarnedFeeValue_(row);
    var category = String(row[5] || '').trim().toLowerCase();
    var description = String(row[6] || '').trim().toLowerCase();

    if (category === 'income' && /^monthly interest \| gross [0-9.]+ \| tax [0-9.]+$/.test(description)) {
      card += amount;
      continue;
    }
    if (category === 'hold' && description === 'hold money') {
      heldMoney += amount;
      continue;
    }
    if (category === 'hold' && description === 'release hold') {
      heldMoney -= amount;
      continue;
    }

    var othersLoanEvent = getTestOthersLoanEventFromRow_(row);
    if (othersLoanEvent) {
      if (othersLoanEvent.action === 'add') {
        card += othersLoanEvent.principal - othersLoanEvent.fee;
        othersLoan += othersLoanEvent.principal;
      } else {
        card -= othersLoanEvent.principal;
        othersLoan = Math.max(0, othersLoan - othersLoanEvent.principal);
      }
      continue;
    }

    var aapCalculation = getTestAapCalculationFromRow_(row);
    if (aapCalculation) {
      if (aapCalculation.receiptOnly) {
        if (aapCalculation.collectionDestination === 'gcash') {
          gcash += aapCalculation.cashReceived;
        } else {
          cashOnHand += aapCalculation.cashReceived;
        }
      } else {
        card -= aapCalculation.appDeduction;
        if (aapCalculation.collectionDestination === 'gcash') {
          gcash += aapCalculation.cashReceived;
        } else {
          cashOnHand += aapCalculation.cashReceived;
        }
      }
      continue;
    }

    var gcashProcessing = getTestGcashAapProcessingFromRow_(row);
    if (gcashProcessing) {
      gcash -= gcashProcessing.cashReceived;
      card += gcashProcessing.feeEarned;
      continue;
    }

    if (description === 'cash-out' && feeEarned > 0 && amount > 0) {
      card += amount + feeEarned;
      cashOnHand -= amount;
      continue;
    }

    if (category === 'transfer' && description === 'atm withdrawal' && amount > 0) {
      card -= amount;
      cashOnHand += amount;
      continue;
    }

    if (category === 'transfer' && description === 'cash to gcash' && amount > 0) {
      cashOnHand -= amount;
      gcash += amount;
      continue;
    }

    if (category === 'transfer' && description === 'gcash to card' && amount > 0) {
      gcash -= amount;
      card += amount;
      continue;
    }

    if (category === 'transfer' && description === 'money to card' && amount > 0) {
      card += amount;
      continue;
    }

    if (category === 'transfer' && description === 'card to gcash' && amount > 0) {
      card -= amount;
      gcash += amount;
      continue;
    }

    if (category === 'transfer' && description === 'gcash to cash' && amount > 0) {
      gcash -= amount;
      cashOnHand += amount;
      continue;
    }

    if (category === 'transfer' && description === 'nanay to cash' && amount > 0) {
      cashOnHand += amount;
      utangKayNanay += amount;
      continue;
    }

    if (category === 'transfer' && description === 'cash to nanay' && amount > 0) {
      cashOnHand -= amount;
      utangKayNanay = Math.max(0, utangKayNanay - amount);
      continue;
    }

    if (isTestLoanPaymentRow_(row)) {
      card -= amount;
      continue;
    }

    if (isTestLoanRebateRow_(row)) {
      card += amount;
    }
  }

  var spendableCard = card - heldMoney;
  var totalApp = gcash + spendableCard;
  return {
    cashOnApp: totalApp,
    totalApp: totalApp,
    gcash: gcash,
    card: spendableCard,
    cashOnHand: cashOnHand,
    totalMoney: totalApp + cashOnHand + TEST_START_SAVINGS_INCLUDED_IN_TOTAL_,
    heldMoney: heldMoney,
    totalEarned: totalEarned,
    thisWeekEarned: thisWeekEarned,
    loanRemaining: Math.round(loanRemaining * 100) / 100,
    utangKayNanay: utangKayNanay,
    othersLoan: othersLoan
  };
}

function getKonek2CardEffectiveStartMs_(liveStartAt) {
  var configured = new Date(liveStartAt).getTime();
  var fixedStart = KONEK2CARD_FIRST_MONTH_.getTime();
  return isNaN(configured) ? fixedStart : Math.max(configured, fixedStart);
}

var KONEK2CARD_FIRST_MONTH_ = new Date(2026, 7, 1);

function getTestRowTimestamp_(row) {
  var dateValue = row && row[0];
  var timeValue = row && row[1];
  var date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (isNaN(date.getTime())) return NaN;

  if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
    date.setHours(
      timeValue.getHours(),
      timeValue.getMinutes(),
      timeValue.getSeconds(),
      timeValue.getMilliseconds()
    );
  }
  return date.getTime();
}

function getTestEarnedFeeValue_(row) {
  if (String(row && row[5] || '').toLowerCase()==='income' && /^Monthly interest \| Gross [0-9.]+ \| Tax [0-9.]+$/.test(String(row && row[6] || ''))) return Number(row[3] || 0);
  var processing = getTestGcashAapProcessingFromRow_(row);
  if (processing) return processing.feeEarned;
  var aapCalculation = getTestAapCalculationFromRow_(row);
  if (aapCalculation) {
    return aapCalculation.receiptOnly ? 0 : aapCalculation.feeEarned;
  }
  var fee = Number(row && row[4] || 0);
  return isTestLegacyFeeValue_(fee) ? fee : 0;
}

function getTestGcashAapProcessingFromRow_(row) {
  var category = String(row && row[5] || '').trim().toLowerCase();
  var description = String(row && row[6] || '').trim();
  if (category !== 'transfer') return null;

  var match = description.match(/^AAP GCash to Card — (\d+) people, ₱([\d,]+(?:\.\d{1,2})?) book, ₱([\d,]+(?:\.\d{1,2})?) total fee$/);
  if (!match) return null;

  var people = Number(match[1]);
  var bookTotal = Number(match[2].replace(/,/g, ''));
  var calculation = calculateTestAap_(people, bookTotal);
  var amount = Number(row && row[3] || 0);
  var feeEarned = Number(row && row[4] || 0);
  if (Number(match[3].replace(/,/g, '')) !== calculation.totalFee ||
      amount !== calculation.cashReceived || feeEarned !== calculation.feeEarned) {
    return null;
  }
  return calculation;
}

function getTestAapCalculationFromRow_(row) {
  var customer = String(row && row[2] || '').trim();
  var category = String(row && row[5] || '').trim().toLowerCase();
  var description = String(row && row[6] || '').trim();
  if (customer !== TEST_AAP_CUSTOMER_ || category !== 'collection') return null;

  var match = description.match(/^AAP(?: (Cash|GCash))? — (\d+) people, ₱([\d,]+(?:\.\d{1,2})?) book, ₱([\d,]+(?:\.\d{1,2})?) total fee$/);
  if (!match) return null;

  var calculation = calculateTestAap_(
    Number(match[2]),
    Number(match[3].replace(/,/g, ''))
  );
  var recordedFee = Number(row && row[4] || 0);
  var recordedAmount = Number(row && row[3] || 0);
  var collectionDestination = String(match[1] || 'Cash').toLowerCase();
  var validFee = recordedFee === calculation.feeEarned || recordedFee === 0;
  if (!validFee || recordedAmount !== calculation.cashReceived) {
    return null;
  }
  calculation.collectionDestination = collectionDestination;
  calculation.receiptOnly = recordedFee === 0;
  return calculation;
}

function isTestLegacyFeeValue_(value) {
  return TEST_LEGACY_FEE_VALUES_.indexOf(Number(value)) !== -1;
}

var TEST_LEGACY_FEE_VALUES_ = [7, 12, 22, 32, 52];

function isTestLoanPaymentRow_(row) {
  var amount = Number(row && row[3] || 0);
  var category = String(row && row[5] || '').trim().toLowerCase();
  var description = String(row && row[6] || '').trim().toLowerCase();
  return amount > 0 &&
    (category === 'expense' || category === 'expenses') &&
    (description === 'loan' || description === 'loan payment');
}

var TEST_BALANCE_RESET_AT_;

var TEST_START_GCASH_;

var TEST_START_BANK_CARD_;

var TEST_START_CASH_ON_HAND_;

var TEST_START_LOAN_REMAINING_;

var TEST_START_OTHERS_LOAN_;

var TEST_START_HELD_MONEY_;

function getTestOthersLoanEventFromRow_(row) {
  var customer = String(row && row[2] || '').trim().toLowerCase();
  var category = String(row && row[5] || '').trim().toLowerCase();
  var description = String(row && row[6] || '').trim();
  var amount = Number(row && row[3] || 0);
  if (customer !== 'others loan' || category !== 'transfer' || amount <= 0) return null;

  var addMatch = description.match(/^Others Loan Add \| (.*?) \| Fee ([\d.]+)$/i);
  if (addMatch) {
    var fee = Number(addMatch[2] || 0);
    if (!isFinite(fee) || fee < 0 || fee >= amount) return null;
    return { action: 'add', principal: amount, fee: fee, lender: addMatch[1] };
  }

  var minusMatch = description.match(/^Others Loan Minus \| (.*)$/i);
  if (minusMatch) {
    return { action: 'minus', principal: amount, fee: 0, lender: minusMatch[1] };
  }
  return null;
}

function isTestLoanRebateRow_(row) {
  return Number(row && row[3] || 0) > 0 &&
    String(row && row[5] || '').trim().toLowerCase() === 'income' &&
    String(row && row[6] || '').trim().toLowerCase() === 'loan rebate';
}

var TEST_START_SAVINGS_INCLUDED_IN_TOTAL_;

function filterTestTransactionsFromRows_(rows, requestedFilter, liveStartAt) {
  var filter = String(requestedFilter || "").trim().toLowerCase();
  var allowed = ["total-money", "loan-remaining", "total-earned", "this-week-earned", "card", "cash", "gcash", "nanay", "others-loan", "held-money"];
  if (allowed.indexOf(filter) === -1) throw new Error("Choose a valid Konek2Card filter.");
  var startMs = new Date(liveStartAt).getTime();
  var liveRows = (rows || []).filter(function(row) {
    var ts = getTestRowTimestamp_(row);
    return !isNaN(ts) && (isNaN(startMs) || ts >= startMs);
  });
  var boundaryIndex = liveRows.findIndex(function(row) { return isTestLoanPaymentRow_(row); });
  return liveRows.map(function(row, index) {
    var ts = getTestRowTimestamp_(row);
    var customer = String(row[2] || "").trim();
    var amount = Math.abs(Number(row[3]) || 0);
    var fee = getTestEarnedFeeValue_(row);
    var category = String(row[5] || "").trim();
    var description = String(row[6] || "").trim();
    var text = (customer + " " + category + " " + description).toLowerCase();
    var matches = false;
    if (filter === "total-money") matches = true;
    else if (filter === "loan-remaining") matches = isTestLoanPaymentRow_(row) || isTestLoanRebateRow_(row);
    else if (filter === "total-earned") matches = fee > 0;
    else if (filter === "this-week-earned") matches = fee > 0 && (boundaryIndex === -1 || index < boundaryIndex);
    else if (filter === "others-loan") matches = !!getTestOthersLoanEventFromRow_(row);
    else if (filter === "held-money") matches = category.toLowerCase() === "hold";
    else if (filter === "nanay") matches = /nanay/.test(text);
    else if (filter === "gcash") matches = /gcash/.test(text);
    else if (filter === "cash") matches = /cash/.test(text) || /atm withdrawal/.test(text);
    else if (filter === "card") matches = /card|cash-out|loan payment|loan rebate|atm withdrawal|others loan|monthly interest/.test(text);
    if (!matches || (amount <= 0 && fee <= 0)) return null;
    return {
      timestamp: ts, dateValue: row[0], timeValue: row[1] instanceof Date ? row[1] : "",
      customer: customer, amount: (filter === "total-earned" || filter === "this-week-earned") ? fee : amount,
      feeEarned: fee, category: category, description: description,
      isExpense: category.toLowerCase() === "expense" || category.toLowerCase() === "expenses",
      rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
    };
  }).filter(Boolean).sort(function(a,b){ return b.timestamp - a.timestamp; });
}

function filterLifeLogTransactionsFromRows_(rows, filter, year, month, issue) {
  var normalizedFilter = String(filter || "").trim().toLowerCase();
  var allowed = ["total", "health", "grooming", "home", "device", "car", "travel", "other", "common-health", "latest-health"];
  if (allowed.indexOf(normalizedFilter) === -1) throw new Error("Choose a valid Life Log filter.");
  var start = new Date(Number(year), Number(month) - 1, 1).getTime();
  var end = new Date(Number(year), Number(month), 1).getTime();
  var issueKey = normalizeLifeLogIssueKey_(issue);
  var entries = buildLifeLogRecentEntriesFromRows_(rows, Number.MAX_SAFE_INTEGER).filter(function(entry) {
    if (entry.timestamp < start || entry.timestamp >= end) return false;
    if (normalizedFilter === "total") return true;
    if (normalizedFilter === "common-health") return entry.category === "Health" && normalizeLifeLogIssueKey_(entry.description) === issueKey;
    if (normalizedFilter === "latest-health") return entry.category === "Health";
    return entry.category.toLowerCase() === normalizedFilter;
  });
  return normalizedFilter === "latest-health" ? entries.slice(0, 1) : entries;
}

function normalizeLifeLogIssueKey_(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildLifeLogRecentEntriesFromRows_(rows, limit) {
  var safeLimit = Math.max(0, Number(limit) || 0);

  return rows
    .map(function(row) {
      var dateValue = row[0];
      var timeValue = row[1];

      if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return null;
      if (!String(row[3] || "").trim()) return null;

      var timestamp = new Date(dateValue.getTime());
      timestamp.setHours(0, 0, 0, 0);

      var hasTime = timeValue instanceof Date && !isNaN(timeValue.getTime());
      if (hasTime) {
        timestamp.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
      }

      return {
        timestamp: timestamp.getTime(),
        dateValue: dateValue,
        timeValue: hasTime ? timeValue : "",
        category: String(row[2] || "").trim(),
        description: String(row[3] || "").trim(),
        notes: String(row[4] || "").trim(),
        rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
      };
    })
    .filter(function(entry) {
      return !!entry;
    })
    .sort(function(a, b) {
      return b.timestamp - a.timestamp;
    })
    .slice(0, safeLimit);
}

function buildLifeLogMonthlyDashboardFromRows_(rows, year, month) {
  var selectedYear = Number(year);
  var selectedMonth = Number(month);
  var monthStart = new Date(selectedYear, selectedMonth - 1, 1).getTime();
  var nextMonth = new Date(selectedYear, selectedMonth, 1).getTime();
  var counts = { Health: 0, Grooming: 0, Home: 0, Device: 0, Car: 0, Travel: 0, Other: 0 };
  var valid = buildLifeLogRecentEntriesFromRows_(rows, Number.MAX_SAFE_INTEGER)
    .filter(function(entry) { return entry.timestamp >= monthStart && entry.timestamp < nextMonth; });
  var issueMap = {};
  var latestHealth = null;

  valid.forEach(function(entry) {
    if (Object.prototype.hasOwnProperty.call(counts, entry.category)) counts[entry.category]++;
    if (entry.category !== "Health") return;
    if (!latestHealth || entry.timestamp > latestHealth.timestamp) latestHealth = entry;
    var key = normalizeLifeLogIssueKey_(entry.description);
    if (!key) return;
    if (!issueMap[key]) issueMap[key] = { count: 0, latestTimestamp: 0, description: entry.description };
    issueMap[key].count++;
    if (entry.timestamp >= issueMap[key].latestTimestamp) {
      issueMap[key].latestTimestamp = entry.timestamp;
      issueMap[key].description = entry.description;
    }
  });

  var common = null;
  Object.keys(issueMap).forEach(function(key) {
    var candidate = issueMap[key];
    if (!common || candidate.count > common.count ||
        (candidate.count === common.count && candidate.latestTimestamp > common.latestTimestamp)) {
      common = candidate;
    }
  });

  return {
    year: selectedYear, month: selectedMonth, totalLogs: valid.length, counts: counts,
    mostCommonHealthIssue: common ? common.description : "",
    mostCommonHealthCount: common ? common.count : 0,
    latestHealthLog: latestHealth ? latestHealth.description : "",
    latestHealthDateValue: latestHealth ? latestHealth.dateValue : null
  };
}

function filterRentalTransactionsFromRows_(rows, requestedCategory, requestedFilter) {
  var category = String(requestedCategory || "").trim().toLowerCase();
  var filter = String(requestedFilter || "").trim().toLowerCase();
  if (["insta360", "chair & table"].indexOf(category) === -1) throw new Error("Choose a valid Rental category.");
  if (["income", "expense", "total-money", "transactions"].indexOf(filter) === -1) throw new Error("Choose a valid Rental filter.");
  return (rows || []).map(function(row) {
    var date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    var time = row[1];
    var amount = Math.abs(Number(row[2]) || 0);
    var type = String(row[3] || "").trim();
    var rowCategory = String(row[4] || "").trim();
    var description = String(row[5] || "").trim();
    if (isNaN(date.getTime()) || amount <= 0 || rowCategory.toLowerCase() !== category) return null;
    var isExpense = type.toLowerCase() === "expense" || type.toLowerCase() === "expenses";
    if (filter === "income" && isExpense) return null;
    if (filter === "expense" && !isExpense) return null;
    var stamp = new Date(date.getTime()); stamp.setHours(0,0,0,0);
    if (time instanceof Date && !isNaN(time.getTime())) stamp.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return { timestamp: stamp.getTime(), dateValue: date, timeValue: time instanceof Date ? time : "", amount: amount, category: rowCategory, type: isExpense ? "Expense" : "Income", description: description, isExpense: isExpense, rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint };
  }).filter(Boolean).sort(function(a,b) { return b.timestamp - a.timestamp; });
}

function filterMoneyFlowTransactionsFromRows_(rows, requestedFilter, asOfDate) {
  var filter = String(requestedFilter || "").trim().toLowerCase();
  var allowed = ["income", "expense", "transactions", "today-expenses", "highest-expense"];
  if (allowed.indexOf(filter) === -1) throw new Error("Choose a valid Money Flow filter.");
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  var items = (Array.isArray(rows) ? rows : []).map(buildMoneyFlowTransactionFromRow_).filter(Boolean);
  items = items.filter(function(item) {
    if (filter === "income") return !item.isExpense;
    if (filter === "expense" || filter === "highest-expense") return item.isExpense;
    if (filter === "today-expenses") return item.isExpense && item.timestamp >= todayStart && item.timestamp < tomorrowStart;
    return true;
  });
  if (filter === "highest-expense") {
    return items.sort(function(a, b) {
      var aCurrent = a.timestamp >= monthStart ? 1 : 0;
      var bCurrent = b.timestamp >= monthStart ? 1 : 0;
      if (aCurrent !== bCurrent) return bCurrent - aCurrent;
      if (a.amount !== b.amount) return b.amount - a.amount;
      return b.timestamp - a.timestamp;
    });
  }
  return items.sort(function(a, b) { return b.timestamp - a.timestamp; });
}

function buildMoneyFlowTransactionFromRow_(row) {
  var compact = row.length < 8;
  var dateValue = row[0];
  var timeValue = row[1];
  var amount = Math.abs(Number(compact ? row[2] : row[5]) || 0);
  var category = String(compact ? row[3] : row[4] || "").trim();
  var description = String(compact ? row[4] : row[3] || row[2] || "").trim();
  var payment = compact ? "" : String(row[6] || "").trim();
  var transactionDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!dateValue || amount <= 0 || isNaN(transactionDate.getTime())) return null;
  var isIncome = category.toLowerCase() === "income";
  var timestamp = new Date(transactionDate.getTime());
  timestamp.setHours(0, 0, 0, 0);
  if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
    timestamp.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
  }
  return {
    timestamp: timestamp.getTime(), dateValue: transactionDate,
    timeValue: timeValue instanceof Date ? timeValue : "", amount: amount,
    category: isIncome ? "Income" : "Expense", description: description,
    merchant: description, payment: payment, isExpense: !isIncome,
    rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
  };
}

function filterIncomeExpenseTransactionsFromRows_(rows, requestedCategory) {
  var categoryFilter = String(requestedCategory || "").trim().toLowerCase();

  if (["income", "expense", "transactions"].indexOf(categoryFilter) === -1) {
    throw new Error("Choose Income, Expense, or Transactions.");
  }

  return rows
    .map(function(row) {
      var dateValue = row[0];
      var timeValue = row[1];
      var amount = Math.abs(Number(row[2]) || 0);
      var categoryLower = String(row[3] || "").trim().toLowerCase();
      var description = String(row[4] || "").trim();
      var isIncome = categoryLower === "income";
      var isExpense = categoryLower === "expense" || categoryLower === "expenses";
      var transactionDate = dateValue instanceof Date ? dateValue : new Date(dateValue);

      if (
        (!isIncome && !isExpense) ||
        (categoryFilter !== "transactions" && categoryFilter !== (isIncome ? "income" : "expense")) ||
        amount <= 0 ||
        isNaN(transactionDate.getTime())
      ) {
        return null;
      }

      var timestamp = new Date(transactionDate.getTime());
      timestamp.setHours(0, 0, 0, 0);

      if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
        timestamp.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
      }

      return {
        timestamp: timestamp.getTime(),
        dateValue: transactionDate,
        timeValue: timeValue instanceof Date ? timeValue : "",
        amount: amount,
        category: isIncome ? "Income" : "Expense",
        description: description,
        isExpense: isExpense,
        rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
      };
    })
    .filter(function(item) { return !!item; })
    .sort(function(a, b) { return b.timestamp - a.timestamp; });
}

function filterGcashBusinessTransactionsFromRows_(rows, requestedCategory) {
  var categoryFilter = String(requestedCategory || "").trim().toLowerCase();
  var allowedCategories = ["gcash", "maya", "load", "bills"];

  if (allowedCategories.indexOf(categoryFilter) === -1) {
    throw new Error("Choose GCash, Maya, Load, or Bills.");
  }

  return rows
    .map(function(row) {
      var dateValue = row[0];
      var timeValue = row[1];
      var amount = Math.abs(Number(row[2]) || 0);
      var columnE = String(row[3] || "").trim();
      var columnF = String(row[4] || "").trim();
      var eLower = columnE.toLowerCase();
      var fLower = columnF.toLowerCase();
      var categoryKey = "";

      if (allowedCategories.indexOf(eLower) !== -1) {
        categoryKey = eLower;
      } else if (allowedCategories.indexOf(fLower) !== -1) {
        categoryKey = fLower;
      }

      var transactionDate = dateValue instanceof Date
        ? dateValue
        : new Date(dateValue);

      if (
        categoryKey !== categoryFilter ||
        amount <= 0 ||
        isNaN(transactionDate.getTime())
      ) {
        return null;
      }

      var isExpense =
        eLower === "expense" ||
        /(^|[^a-z])(expense|expenses|cash[ -]?out)([^a-z]|$)/i.test(columnF);
      var timestamp = new Date(transactionDate.getTime());
      timestamp.setHours(0, 0, 0, 0);

      if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
        timestamp.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
      }

      return {
        timestamp: timestamp.getTime(),
        dateValue: transactionDate,
        timeValue: timeValue instanceof Date ? timeValue : "",
        amount: amount,
        category: categoryKey === "gcash"
          ? "GCash"
          : categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1),
        description: allowedCategories.indexOf(eLower) !== -1 ? columnF : columnE,
        isExpense: isExpense
      };
    })
    .filter(function(item) {
      return !!item;
    })
    .sort(function(a, b) {
      return b.timestamp - a.timestamp;
    });
}

function computeCashInOutMonthlyTotalsFromRows_(rows, monthKey) {
  var totals = { gcash: 0, maya: 0, load: 0, bills: 0 };
  (rows || []).forEach(function(row) {
    var date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    var amount = Math.abs(Number(row[2]) || 0);
    if (isNaN(date.getTime()) || date < CASH_IN_OUT_FIRST_DATE_ || amount <= 0) return;
    var key = String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
    if (key !== monthKey) return;
    var columnE = String(row[3] || '').trim().toLowerCase();
    var columnF = String(row[4] || '').trim();
    var columnFLower = columnF.toLowerCase();
    var category = ['gcash','maya','load','bills'].indexOf(columnE) !== -1
      ? columnE
      : (['gcash','maya','load','bills'].indexOf(columnFLower) !== -1 ? columnFLower : '');
    if (!category) return;
    var isExpense = columnE === 'expense' || /(^|[^a-z])(expense|expenses|cash[ -]?out)([^a-z]|$)/i.test(columnF);
    totals[category] += isExpense ? -amount : amount;
  });
  return totals;
}

var CASH_IN_OUT_FIRST_DATE_ = new Date(2026, 6, 16);

function getLifeLogDashboardData(selectedYear, selectedMonth) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Life Log");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Life Log".');
  }

  var layout = ensureLifeLogSheetLayout_(sheet);
  var lastRow = sheet.getLastRow();
  var rows = lastRow > layout.headerRow
    ? sheet.getRange(
        layout.headerRow + 1,
        layout.startColumn,
        lastRow - layout.headerRow,
        layout.columnCount
      ).getValues()
    : [];
  tagCashflowRows_(rows, layout.headerRow + 1);
  var timeZone = Session.getScriptTimeZone();

  var now = new Date();
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, now);
  var year = period.year;
  var month = period.month;
  var monthly = buildLifeLogMonthlyDashboardFromRows_(rows, year, month);
  var monthOptions = getLifeLogMonthOptions_(rows, now);

  var recentEntries = buildLifeLogRecentEntriesFromRows_(rows, Number.MAX_SAFE_INTEGER)
    .filter(function(entry) { return entry.timestamp >= period.start.getTime() && entry.timestamp < period.next.getTime(); })
    .slice(0, 10)
    .map(function(entry) {
      return {
        date: Utilities.formatDate(entry.dateValue, timeZone, "MMMM d, yyyy"),
        time: entry.timeValue instanceof Date
          ? Utilities.formatDate(entry.timeValue, timeZone, "hh:mm a")
          : "",
        category: entry.category,
        description: entry.description,
        notes: entry.notes,
        rowNumber: entry.rowNumber, rowFingerprint: entry.rowFingerprint
      };
    });

  var result = {
    selectedYear: year,
    selectedMonth: month,
    monthLabel: monthOptions.filter(function(option) { return option.year === year && option.month === month; })[0].label,
    monthOptions: monthOptions,
    totalLogs: monthly.totalLogs,
    counts: monthly.counts,
    mostCommonHealthIssue: monthly.mostCommonHealthIssue,
    mostCommonHealthCount: monthly.mostCommonHealthCount,
    latestHealthLog: monthly.latestHealthLog,
    latestHealthDate: monthly.latestHealthDateValue instanceof Date
      ? Utilities.formatDate(monthly.latestHealthDateValue, timeZone, "MMMM d, yyyy") : "",
    recentEntries: recentEntries
  };
  refreshLifeLogSheetDashboard_(sheet, rows, result, monthOptions);
  return result;
}

function ensureLifeLogSheetLayout_(){return {headerRow:4,startColumn:2,columnCount:5};}

function tagCashflowRows_(rows){return rows;}

function getAllowedDashboardPeriod_(selectedYear, selectedMonth, now) {
  var current = now instanceof Date ? now : new Date();
  var year = Math.floor(Number(selectedYear)) || current.getFullYear();
  var month = Math.floor(Number(selectedMonth)) || (current.getMonth() + 1);
  if (month < 1 || month > 12) month = current.getMonth() + 1;
  var requestedStart = new Date(year, month - 1, 1);
  var currentStart = new Date(current.getFullYear(), current.getMonth(), 1);
  if (requestedStart.getTime() > currentStart.getTime()) {
    year = current.getFullYear();
    month = current.getMonth() + 1;
  }
  return {
    year: year,
    month: month,
    start: new Date(year, month - 1, 1),
    next: new Date(year, month, 1)
  };
}

function getLifeLogMonthOptions_(rows, now) {
  var current = now instanceof Date ? now : new Date();
  var years = [current.getFullYear()];
  (rows || []).forEach(function(row) {
    var date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (!isNaN(date.getTime()) && years.indexOf(date.getFullYear()) === -1) years.push(date.getFullYear());
  });
  years.sort(function(a, b) { return b - a; });
  var monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var options = [];
  years.forEach(function(year) {
    for (var month = 12; month >= 1; month--) {
      if (year > current.getFullYear() ||
          (year === current.getFullYear() && month > current.getMonth() + 1)) continue;
      options.push({ year: year, month: month, label: monthNames[month - 1] + " " + year });
    }
  });
  return options;
}

function refreshLifeLogSheetDashboard_(){}

function getExpenseDashboardData(selectedYear, selectedMonth) {

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Money Flow");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Money Flow".');
  }

  var timeZone = Session.getScriptTimeZone();
  var today = new Date();
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, today);
  var currentMonthKey = String(period.year) + "-" + String(period.month).padStart(2, "0");
  var todayKey = Utilities.formatDate(today, timeZone, "yyyy-MM-dd");
  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 5
    ? sheet.getRange(5, 2, lastRow - 4, 8).getValues()
    : [];

  tagCashflowRows_(rows, 5);
  var monthlyExpenses = 0;
  var monthlyIncome = 0;
  var totalIncome = 0;
  var todayExpenses = 0;
  var highestExpense = 0;
  var allTransactions = 0;
  var recentTransactions = [];

  rows.forEach(function(row) {

    var dateValue = row[0];       // B - Date
    var merchant = row[2];        // D - Merchant
    var description = row[3];     // E - Description
    var category = row[4];        // F - Category
    var amount = normalizeDashboardAmount_(row[5]); // G - Amount
    var payment = row[6];         // H - Payment Method

    if (!dateValue || amount <= 0) return;

    var transactionDate = dateValue instanceof Date
      ? dateValue
      : new Date(dateValue);

    if (isNaN(transactionDate.getTime())) return;

    var monthKey = Utilities.formatDate(transactionDate, timeZone, "yyyy-MM");
    var dateKey = Utilities.formatDate(transactionDate, timeZone, "yyyy-MM-dd");
    var isIncome = String(category || "").trim().toLowerCase() === "income";

    if (isIncome) totalIncome += amount;

    if (monthKey === currentMonthKey) {
      allTransactions++;

      if (isIncome) {
        monthlyIncome += amount;
      } else {
        monthlyExpenses += amount;
        highestExpense = Math.max(highestExpense, amount);

        if (dateKey === todayKey) {
          todayExpenses += amount;
        }
      }
    }

    if (monthKey === currentMonthKey && recentTransactions.length < 10) {
      recentTransactions.push({
        rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint,
        date: Utilities.formatDate(transactionDate, timeZone, "MMM d"),
        merchant: String(merchant || description || category || "Transaction"),
        category: String(category || "Other"),
        payment: String(payment || ""),
        amount: amount,
        isIncome: isIncome
      });
    }
  });

  return {
    monthLabel: Utilities.formatDate(period.start, timeZone, "MMMM yyyy"),
    totalIncome: totalIncome,
    monthlyExpenses: monthlyExpenses,
    monthlyIncome: monthlyIncome,
    balance: monthlyIncome - monthlyExpenses,
    allTransactions: allTransactions,
    todayExpenses: todayExpenses,
    highestExpense: highestExpense,
    recentTransactions: recentTransactions
  };
}

function normalizeDashboardAmount_(value) {

  if (typeof value === "number") {
    return isNaN(value) ? 0 : value;
  }

  var cleaned = String(value || "")
    .replace(/[^0-9.-]/g, "");

  var amount = Number(cleaned);
  return isNaN(amount) ? 0 : amount;
}

function getRentalDashboardData(selectedYear, selectedMonth) {
  var rows = getRentalRows_();
  var now = new Date();
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, now);
  var monthOptions = getRentalAvailableMonthOptions_(rows, now);
  var requestedKey = String(period.year) + "-" + String(period.month).padStart(2, "0");
  var validKeys = monthOptions.map(function(option) { return option.value; });
  if (validKeys.indexOf(requestedKey) === -1) {
    var fallback = monthOptions[0].value.split("-");
    period = getAllowedDashboardPeriod_(Number(fallback[0]), Number(fallback[1]), now);
  }
  var totalIncome = 0;
  function summary(category) {
    var all = filterRentalTransactionsFromRows_(rows, category, "transactions");
    var monthly = filterRentalTransactionsByPeriod_(all, period.year, period.month, now);
    var income = monthly.filter(function(item) { return !item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    totalIncome += all.filter(function(item) { return !item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    var expenses = monthly.filter(function(item) { return item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    var totalMoney = monthly.reduce(function(sum,item){ return sum + (item.isExpense ? -item.amount : item.amount); },0);
    return { income: income, expenses: expenses, totalMoney: totalMoney, transactions: monthly.length };
  }
  var allRecent = filterRentalTransactionsFromRows_(rows, "Insta360", "transactions")
    .concat(filterRentalTransactionsFromRows_(rows, "Chair & Table", "transactions"))
    .filter(function(item){ return item.timestamp >= period.start.getTime() && item.timestamp < period.next.getTime(); })
    .sort(function(a,b){ return b.timestamp - a.timestamp; }).slice(0, 10);
  var timeZone = Session.getScriptTimeZone();
  function display(item) { return { date: Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy"), time: item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", amount:item.amount, category:item.category, type:item.type, description:item.description, isExpense:item.isExpense, rowNumber:item.rowNumber, rowFingerprint:item.rowFingerprint }; }
  var categories = { insta360: summary("Insta360"), chairTable: summary("Chair & Table") };
  return {
    monthLabel: Utilities.formatDate(period.start,timeZone,"MMMM yyyy"),
    selectedMonthValue: String(period.year) + "-" + String(period.month).padStart(2, "0"),
    monthOptions: monthOptions,
    totalIncome: totalIncome,
    categories: categories,
    recentTransactions: allRecent.map(display)
  };
}

function getRentalRows_(){return currentRows('Rental');}

function getRentalAvailableMonthOptions_(rows, asOfDate) {
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  var names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var keys = {};
  function addMonth(date) {
    var monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    if (monthStart.getTime() > currentMonth.getTime()) return;
    keys[String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0")] = true;
  }
  addMonth(currentMonth);
  normalizeRentalSheetRows_(rows).forEach(function(row) { addMonth(row[0]); });
  return Object.keys(keys).sort(function(a, b) { return a < b ? 1 : a > b ? -1 : 0; }).map(function(key) {
    var parts = key.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    return { value: key, label: names[month - 1] + " " + year };
  });
}

function normalizeRentalSheetRows_(rows) {
  var validCategories = { "insta360": "Insta360", "chair & table": "Chair & Table" };
  return (rows || []).map(function(row) {
    var date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    var amount = Math.abs(Number(row[2]) || 0);
    if (isNaN(date.getTime()) || amount <= 0) return null;
    var fourth = String(row[3] || "").trim();
    var fifth = String(row[4] || "").trim();
    var fourthLower = fourth.toLowerCase();
    var fifthLower = fifth.toLowerCase();
    var type = (fourthLower === "income" || fourthLower === "expense" || fourthLower === "expenses") ? fourth : fifth;
    var category = type === fourth ? fifth : fourth;
    var cleanCategory = validCategories[String(category || "").toLowerCase()];
    var cleanType = String(type || "").toLowerCase();
    if (!cleanCategory || ["income", "expense", "expenses"].indexOf(cleanType) === -1) return null;
    return [date, row[1], amount, cleanType === "income" ? "Income" : "Expense", cleanCategory, String(row[5] || "").trim()];
  }).filter(Boolean);
}

function filterRentalTransactionsByPeriod_(transactions, selectedYear, selectedMonth, asOfDate) {
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, asOfDate || new Date());
  var start = period.start.getTime();
  var next = period.next.getTime();
  return (transactions || []).filter(function(item) { return item.timestamp >= start && item.timestamp < next; });
}

function getTestDashboardData(selectedYear, selectedMonth) {
  ensureTestCashOutSetup_();

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(TEST_SHEET_NAME_);
  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "test".');
  }

  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 5
    ? sheet.getRange(5, 2, lastRow - 4, 7).getValues()
    : [];
  tagCashflowRows_(rows, 5);

  var properties = PropertiesService.getDocumentProperties();
  var liveStartAt = properties.getProperty(TEST_LIVE_START_AT_KEY_);
  var dashboard = computeTestDashboardFromRows_(rows, liveStartAt);
  var timeZone = Session.getScriptTimeZone();
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, new Date());
  var recentTransactions = [];

  for (var i = 0; i < rows.length && recentTransactions.length < TEST_RECENT_LIMIT_; i++) {
    var row = rows[i];
    var dateValue = row[0];
    var timeValue = row[1];
    var customer = String(row[2] || '').trim();
    var amount = Number(row[3] || 0);
    var feeEarned = getTestEarnedFeeValue_(row);
    var category = String(row[5] || '').trim();
    var description = String(row[6] || '').trim();

    if (!dateValue && !customer && !amount && !feeEarned && !category && !description) {
      continue;
    }

    var transactionDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(transactionDate.getTime()) || transactionDate < period.start || transactionDate >= period.next) {
      continue;
    }

    var dateText = '';
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      dateText = Utilities.formatDate(dateValue, timeZone, 'MM/dd/yy');
    } else if (dateValue) {
      dateText = String(dateValue);
    }

    var timeText = '';
    if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
      timeText = Utilities.formatDate(timeValue, timeZone, 'hh:mm a');
    } else if (timeValue) {
      timeText = String(timeValue);
    }

    recentTransactions.push({
      date: dateText,
      time: timeText,
      customer: customer,
      amount: amount || 0,
      feeEarned: feeEarned || 0,
      category: category,
      description: description,
      rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
    });
  }

  var result = {
    displayName: TEST_DISPLAY_NAME_,
    monthLabel: Utilities.formatDate(period.start, timeZone, 'MMMM yyyy'),
    totalMoney: dashboard.totalMoney,
    heldMoney: dashboard.heldMoney,
    cashOnHand: dashboard.cashOnHand,
    cashOnApp: dashboard.cashOnApp,
    totalApp: dashboard.totalApp,
    gcash: dashboard.gcash,
    card: dashboard.card,
    totalEarned: dashboard.totalEarned,
    thisWeekEarned: dashboard.thisWeekEarned,
    loanRemaining: dashboard.loanRemaining,
    utangKayNanay: dashboard.utangKayNanay,
    othersLoan: dashboard.othersLoan,
    recentTransactions: recentTransactions
  };

  migrateTestDashboardLayout_(sheet);
  refreshTestSheetDashboard_(sheet, result, rows, liveStartAt, new Date());
  refreshTestYearlyDashboard_(sheet, rows, liveStartAt, new Date());
  return result;
}

function ensureTestCashOutSetup_(){}

var TEST_SHEET_NAME_ = 'Konek2Card';

var TEST_LIVE_START_AT_KEY_ = 'TEST_LIVE_START_AT_V3';

var TEST_RECENT_LIMIT_ = 10;

var TEST_DISPLAY_NAME_ = 'Konek2Card';

function migrateTestDashboardLayout_(){}

function refreshTestSheetDashboard_(){}

function refreshTestYearlyDashboard_(){}

function getTwiceAsNyceDashboardData(selectedYear, selectedMonth) {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName(
      "TwiceAsNyce"
    );

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "TwiceAsNyce".'
    );
  }

  var timeZone =
    Session.getScriptTimeZone();

  var today = new Date();

  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, today);
  var monthStart = period.start;
  var nextMonthStart = period.next;

  var income = 0;
  var totalIncome = 0;
  var expenses = 0;
  var transactions = 0;
  var recentTransactions = [];

  var lastRow =
    sheet.getLastRow();

  if (lastRow >= 5) {

    var chunkSize = 250;
    var startRow = 5;
    var reachedOlderMonth = false;

    while (startRow <= lastRow) {

      var rowCount =
        Math.min(
          chunkSize,
          lastRow - startRow + 1
        );

      var rows =
        sheet
          .getRange(
            startRow,
            2,
            rowCount,
            5
          )
          .getValues();
      tagCashflowRows_(rows, startRow);

      for (var i = 0; i < rows.length; i++) {

        var row = rows[i];
        var dateValue = row[0];
        var timeValue = row[1];
        var amount =
          Math.abs(
            Number(row[2]) || 0
          );
        var category =
          String(row[3] || "")
            .trim();
        var description =
          String(row[4] || "")
            .trim();

        if (!dateValue || amount <= 0) {
          continue;
        }

        var transactionDate =
          dateValue instanceof Date
            ? dateValue
            : new Date(dateValue);

        if (
          isNaN(
            transactionDate.getTime()
          )
        ) {
          continue;
        }

        var categoryLower =
          category.toLowerCase();

        var isIncome =
          categoryLower === "income";

        var isExpense =
          categoryLower === "expense";

        if (!isIncome && !isExpense) {
          continue;
        }

        if (isIncome) totalIncome += amount;

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart &&
          recentTransactions.length <
          APP_RECENT_TRANSACTION_LIMIT
        ) {

          var timeText = "";

          if (
            timeValue instanceof Date &&
            !isNaN(timeValue.getTime())
          ) {
            timeText =
              Utilities.formatDate(
                timeValue,
                timeZone,
                "hh:mm a"
              );
          }

          recentTransactions.push({
            date: Utilities.formatDate(
              transactionDate,
              timeZone,
              "MM/dd/yy"
            ),
            time: timeText,
            amount: amount,
            category: isIncome
              ? "Income"
              : "Expense",
            description: description,
            isExpense: isExpense,
            rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
          });
        }

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart
        ) {
          transactions++;

          if (isExpense) {
            expenses += amount;
          } else if (isIncome) {
            income += amount;
          }

        } else if (
          transactionDate < monthStart
        ) {
          reachedOlderMonth = true;
        }
      }

      startRow += rowCount;
    }
  }

  return {
    monthLabel: Utilities.formatDate(
      period.start,
      timeZone,
      "MMMM yyyy"
    ),
    income: income,
    totalIncome: totalIncome,
    expenses: expenses,
    profit: income - expenses,
    transactions: transactions,
    recentTransactions: recentTransactions
  };
}

var APP_RECENT_TRANSACTION_LIMIT = 10;

function getPrintingBusinessDashboardData(selectedYear, selectedMonth) {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName(
      "Printing Business"
    );

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Printing Business".'
    );
  }

  var timeZone =
    Session.getScriptTimeZone();

  var today =
    new Date();

  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, today);
  var monthStart = period.start;
  var nextMonthStart = period.next;

  var income = 0;
  var totalIncome = 0;
  var expenses = 0;
  var transactions = 0;
  var recentTransactions = [];

  var lastRow =
    sheet.getLastRow();

  if (lastRow >= 5) {

    var chunkSize = 250;
    var startRow = 5;
    var reachedOlderMonth = false;

    while (startRow <= lastRow) {

      var rowCount =
        Math.min(
          chunkSize,
          lastRow - startRow + 1
        );

      var rows =
        sheet
          .getRange(
            startRow,
            2,
            rowCount,
            5
          )
          .getValues();
      tagCashflowRows_(rows, startRow);

      for (var i = 0; i < rows.length; i++) {

        var row = rows[i];

        var dateValue = row[0]; // B
        var timeValue = row[1]; // C
        var amount =
          Math.abs(
            Number(row[2]) || 0
          );                    // D
        var category =
          String(row[3] || "")
            .trim();            // E
        var description =
          String(row[4] || "")
            .trim();            // F

        if (
          !dateValue ||
          amount <= 0
        ) {
          continue;
        }

        var transactionDate =
          dateValue instanceof Date
            ? dateValue
            : new Date(dateValue);

        if (
          isNaN(
            transactionDate.getTime()
          )
        ) {
          continue;
        }

        var categoryLower =
          category.toLowerCase();

        var isIncome =
          categoryLower === "income";

        var isExpense =
          categoryLower === "expense";

        if (
          !isIncome &&
          !isExpense
        ) {
          continue;
        }

        if (isIncome) totalIncome += amount;

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart &&
          recentTransactions.length <
          APP_RECENT_TRANSACTION_LIMIT
        ) {

          var timeText = "";

          if (
            timeValue instanceof Date &&
            !isNaN(timeValue.getTime())
          ) {
            timeText =
              Utilities.formatDate(
                timeValue,
                timeZone,
                "hh:mm a"
              );
          }

          recentTransactions.push({
            date:
              Utilities.formatDate(
                transactionDate,
                timeZone,
                "MM/dd/yy"
              ),
            time: timeText,
            amount: amount,
            category:
              isIncome
                ? "Income"
                : "Expense",
            description: description,
            isExpense: isExpense,
            rowNumber: row.sourceRowNumber, rowFingerprint: row.sourceFingerprint
          });
        }

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart
        ) {

          transactions++;

          if (isIncome) {
            income += amount;
          } else {
            expenses += amount;
          }

        } else if (
          transactionDate < monthStart
        ) {
          reachedOlderMonth = true;
        }
      }

      startRow += rowCount;
    }
  }

  return {
    monthLabel:
      Utilities.formatDate(
        period.start,
        timeZone,
        "MMMM yyyy"
      ),
    income: income,
    totalIncome: totalIncome,
    expenses: expenses,
    profit: income - expenses,
    transactions: transactions,
    totalMoney: Number(sheet.getRange("H4").getValue()) || 0,
    recentTransactions:
      recentTransactions
  };
}

function getGcashBusinessDashboardData(selectedYear, selectedMonth) {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName("Cash In/Out");

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Cash In/Out".'
    );
  }


  var timeZone =
    Session.getScriptTimeZone();

  var today =
    new Date();

  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, today);
  var monthStart = period.start;
  var nextMonthStart = period.next;


  var totals = {
    gcash: 0,
    maya: 0,
    bills: 0,
    load: 0
  };

  var totalIncome = 0;
  var recentTransactions = [];


  var lastRow =
    sheet.getLastRow();


  if (lastRow >= 5) {

    // Read in small chunks instead of loading the entire
    // 7,000+ row history every dashboard refresh.
    //
    // This sheet is newest-first:
    // new transactions are always inserted at Row 5.
    var chunkSize = 250;
    var startRow = 5;
    var reachedOlderMonth = false;


    while (startRow <= lastRow) {

      var rowCount =
        Math.min(
          chunkSize,
          lastRow - startRow + 1
        );


      var rows =
        sheet
          .getRange(
            startRow,
            2,
            rowCount,
            5
          )
          .getValues();


      for (
        var i = 0;
        i < rows.length;
        i++
      ) {

        var row = rows[i];

        var dateValue = row[0]; // B
        var timeValue = row[1]; // C

        var amount =
          Math.abs(
            Number(row[2]) || 0
          );                    // D

        var columnE =
          String(row[3] || "")
            .trim();            // E

        var columnF =
          String(row[4] || "")
            .trim();            // F


        if (
          !dateValue ||
          amount <= 0
        ) {
          continue;
        }


        var transactionDate =
          dateValue instanceof Date
            ? dateValue
            : new Date(dateValue);


        if (
          isNaN(
            transactionDate.getTime()
          )
        ) {
          continue;
        }


        if (transactionDate < CASH_IN_OUT_FIRST_DATE_) {
          continue;
        }


        var eLower =
          columnE.toLowerCase();

        var fLower =
          columnF.toLowerCase();


        var categoryKey = "";


        // NEW FORMAT
        // E = Gcash / Maya / Bills / Load
        // F = Description
        if (
          [
            "gcash",
            "maya",
            "bills",
            "load"
          ].indexOf(eLower) !== -1
        ) {

          categoryKey = eLower;

        }

        // OLD IMPORT FORMAT
        // E = Income / Expense
        // F = Gcash / Maya / Bills / Load
        else if (
          [
            "gcash",
            "maya",
            "bills",
            "load"
          ].indexOf(fLower) !== -1
        ) {

          categoryKey = fLower;

        }


        var isExpense =
          eLower === "expense" ||
          /(^|[^a-z])(expense|expenses|cash[ -]?out)([^a-z]|$)/i
            .test(columnF);

        if (categoryKey && !isExpense) totalIncome += amount;


        // ===================================================
        // RECENT TRANSACTIONS
        // ===================================================

        if (
          recentTransactions.length <
          APP_RECENT_TRANSACTION_LIMIT
        ) {

          var dateText =
            Utilities.formatDate(
              transactionDate,
              timeZone,
              "MM/dd/yy"
            );


          var timeText = "";

          if (
            timeValue instanceof Date &&
            !isNaN(timeValue.getTime())
          ) {

            timeText =
              Utilities.formatDate(
                timeValue,
                timeZone,
                "hh:mm a"
              );
          }


          var displayCategory = "";

          if (categoryKey === "gcash") {
            displayCategory = "Gcash";
          }
          else if (categoryKey === "maya") {
            displayCategory = "Maya";
          }
          else if (categoryKey === "bills") {
            displayCategory = "Bills";
          }
          else if (categoryKey === "load") {
            displayCategory = "Load";
          }
          else {
            displayCategory =
              columnE ||
              columnF ||
              "Cash In/Out";
          }


          var description =
            (
              [
                "gcash",
                "maya",
                "bills",
                "load"
              ].indexOf(eLower) !== -1
            )
              ? columnF
              : columnE;


          recentTransactions.push({
            date: dateText,
            time: timeText,
            amount: amount,
            category: displayCategory,
            description: description,
            isExpense: isExpense,
            rowNumber: row.sourceRowNumber,
            rowFingerprint: cashflowRowFingerprint_(row)
          });
        }


        // ===================================================
        // CURRENT MONTH ONLY
        // ===================================================

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart
        ) {

          if (categoryKey) {

            totals[categoryKey] +=
              isExpense
                ? -amount
                : amount;

          }

        }
        else if (
          transactionDate < monthStart
        ) {

          reachedOlderMonth = true;
        }

      }


      // Since this sheet is newest-first, once we are already
      // below the current month AND have the 10 recent rows,
      // there is nothing else the phone dashboard needs.
      startRow += rowCount;
    }

  }


  return {

    monthLabel:
      Utilities.formatDate(
        period.start,
        timeZone,
        "MMMM yyyy"
      ),

    gcash:
      totals.gcash,

    maya:
      totals.maya,

    bills:
      totals.bills,

    load:
      totals.load,

    totalIncome:
      totalIncome,

    recentTransactions:
      recentTransactions

  };
}

function cashflowRowFingerprint_(row){return row.sourceFingerprint || '';}

function getTestFeeEarned_(amount) {
  var value = validateTestCashOutAmount_(amount);
  if (value <= 500) return 7;
  if (value <= 1000) return 12;
  if (value <= 2000) return 22;
  if (value <= 5000) return 32;
  return 52;
}

function validateTestCashOutAmount_(amount) {
  var value = Number(amount);
  if (!isFinite(value)) throw new Error('Invalid cash-out amount.');
  if (value < 100) throw new Error('Minimum cash-out is ₱100.');
  if (value > 10000) throw new Error('Maximum cash-out is ₱10,000.');
  if (value % 100 !== 0) throw new Error('Amount must be in ₱100 increments.');
  return value;
}

function buildTestCashOutRow_(now, customer, amount, feeEarned) {
  return [now, now, customer, amount, feeEarned, 'Income', 'Cash-out'];
}

function getLifeLogTransactions(filter, year, month, issue, cursor, limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Life Log");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Life Log".');
  var layout = ensureLifeLogSheetLayout_(sheet);
  var rows = sheet.getLastRow() > layout.headerRow
    ? sheet.getRange(layout.headerRow + 1, layout.startColumn, sheet.getLastRow() - layout.headerRow, layout.columnCount).getValues() : [];
  tagCashflowRows_(rows, layout.headerRow + 1);
  var all = filterLifeLogTransactionsFromRows_(rows, filter, year, month, issue);
  var start = Math.max(0, Math.floor(Number(cursor) || 0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start, start + size).map(function(entry) {
    return {
      date: Utilities.formatDate(entry.dateValue, timeZone, "MMMM d, yyyy"),
      time: entry.timeValue instanceof Date ? Utilities.formatDate(entry.timeValue, timeZone, "hh:mm a") : "",
      category: entry.category, description: entry.description, notes: entry.notes,
      rowNumber: entry.rowNumber, rowFingerprint: entry.rowFingerprint
    };
  });
  return { transactions: page, nextCursor: start + page.length, hasMore: start + page.length < all.length };
}

function getRentalTransactions(category, filter, selectedYear, selectedMonth, cursor, limit) {
  var all = filterRentalTransactionsByPeriod_(
    filterRentalTransactionsFromRows_(getRentalRows_(), category, filter),
    selectedYear,
    selectedMonth,
    new Date()
  );
  var start = Math.max(0, Math.floor(Number(cursor)||0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start,start+size).map(function(item){ return { date: Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy"), time:item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", amount:item.amount, category:item.category, type:item.type, description:item.description, isExpense:item.isExpense, rowNumber:item.rowNumber, rowFingerprint:item.rowFingerprint }; });
  return { transactions:page, nextCursor:start+page.length, hasMore:start+page.length<all.length };
}

function getMoneyFlowTransactions(filter, cursor, limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Money Flow");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Money Flow".');
  var rows = sheet.getLastRow() >= 5 ? sheet.getRange(5, 2, sheet.getLastRow() - 4, 8).getValues() : [];
  tagCashflowRows_(rows, 5);
  var all = filterMoneyFlowTransactionsFromRows_(rows, filter, new Date());
  var start = Math.max(0, Math.floor(Number(cursor) || 0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start, start + size).map(function(item) {
    return {
      date: Utilities.formatDate(item.dateValue, timeZone, "MMM d, yyyy"),
      time: item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue, timeZone, "hh:mm a") : "",
      amount: item.amount, category: item.category, description: item.description,
      merchant: item.merchant, payment: item.payment, isExpense: item.isExpense,
      rowNumber: item.rowNumber, rowFingerprint: item.rowFingerprint
    };
  });
  return { filter: filter, transactions: page, nextCursor: start + page.length, hasMore: start + page.length < all.length };
}

function getTestTransactions(filter, cursor, limit) {
  ensureTestCashOutSetup_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
  var rows = sheet.getLastRow() >= 5 ? sheet.getRange(5,2,sheet.getLastRow()-4,7).getValues() : [];
  var liveStartAt = PropertiesService.getDocumentProperties().getProperty(TEST_LIVE_START_AT_KEY_);
  tagCashflowRows_(rows, 5);
  var all = filterTestTransactionsFromRows_(rows, filter, liveStartAt);
  var start = Math.max(0,Math.floor(Number(cursor)||0));
  var size = Math.max(1,Math.min(50,Math.floor(Number(limit)||50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start,start+size).map(function(item){
    return { date: item.dateValue instanceof Date ? Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy") : String(item.dateValue || ""), time:item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", customer:item.customer, amount:item.amount, feeEarned:item.feeEarned, category:item.category, description:item.description, isExpense:item.isExpense, rowNumber:item.rowNumber, rowFingerprint:item.rowFingerprint };
  });
  return { transactions:page, nextCursor:start+page.length, hasMore:start+page.length<all.length };
}

function getIncomeExpenseTransactions(sheetName, category, cursor, limit) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "' + sheetName + '".');
  }

  var totalDataRows = Math.max(0, sheet.getLastRow() - 4);
  var nextCursor = Math.max(0, Math.floor(Number(cursor) || 0));
  var safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var rawTransactions = [];
  var chunkSize = 250;

  while (nextCursor < totalDataRows && rawTransactions.length < safeLimit) {
    var rowCount = Math.min(chunkSize, totalDataRows - nextCursor);
    var rows = sheet.getRange(5 + nextCursor, 2, rowCount, 5).getValues();
    tagCashflowRows_(rows, 5 + nextCursor);
    var page = getIncomeExpenseTransactionsPageFromRows_(
      rows,
      category,
      0,
      safeLimit - rawTransactions.length
    );
    rawTransactions = rawTransactions.concat(page.transactions);
    nextCursor += page.nextCursor;
  }

  var timeZone = Session.getScriptTimeZone();
  return {
    category: String(category || "").trim().toLowerCase(),
    transactions: rawTransactions.map(function(item) {
      return {
        date: Utilities.formatDate(item.dateValue, timeZone, "MM/dd/yy"),
        time: item.timeValue instanceof Date
          ? Utilities.formatDate(item.timeValue, timeZone, "hh:mm a")
          : "",
        amount: item.amount,
        category: item.category,
        description: item.description,
        isExpense: item.isExpense,
        rowNumber: item.rowNumber, rowFingerprint: item.rowFingerprint
      };
    }),
    nextCursor: nextCursor,
    hasMore: nextCursor < totalDataRows
  };
}

function getIncomeExpenseTransactionsPageFromRows_(rows, category, cursor, limit) {
  var nextCursor = Math.max(0, Math.floor(Number(cursor) || 0));
  var safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var transactions = [];

  while (nextCursor < rows.length && transactions.length < safeLimit) {
    var matches = filterIncomeExpenseTransactionsFromRows_([rows[nextCursor]], category);
    nextCursor += 1;
    if (matches.length) transactions.push(matches[0]);
  }

  return {
    transactions: transactions,
    nextCursor: nextCursor,
    hasMore: nextCursor < rows.length
  };
}

function getGcashBusinessTransactions(category, cursor, limit) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Cash In/Out");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Cash In/Out".');
  }

  var lastRow = sheet.getLastRow();
  var totalDataRows = Math.max(0, lastRow - 4);
  var nextCursor = Math.max(0, Math.floor(Number(cursor) || 0));
  var safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var rawTransactions = [];
  var chunkSize = 250;

  while (nextCursor < totalDataRows && rawTransactions.length < safeLimit) {
    var rowCount = Math.min(chunkSize, totalDataRows - nextCursor);
    var rows = sheet.getRange(5 + nextCursor, 2, rowCount, 5).getValues();
    var page = getGcashBusinessTransactionsPageFromRows_(
      rows,
      category,
      0,
      safeLimit - rawTransactions.length
    );

    page.transactions.forEach(function(item) {
      item.rowNumber = rows[item.sourceOffset].sourceRowNumber;
      item.rowFingerprint = cashflowRowFingerprint_(
        rows[item.sourceOffset]
      );
    });
    rawTransactions = rawTransactions.concat(page.transactions);
    nextCursor += page.nextCursor;
  }

  var timeZone = Session.getScriptTimeZone();
  var transactions = rawTransactions
    .map(function(item) {
      return {
        date: Utilities.formatDate(item.dateValue, timeZone, "MM/dd/yy"),
        time: item.timeValue instanceof Date
          ? Utilities.formatDate(item.timeValue, timeZone, "hh:mm a")
          : "",
        amount: item.amount,
        category: item.category,
        description: item.description,
        isExpense: item.isExpense,
        rowNumber: item.rowNumber,
        rowFingerprint: item.rowFingerprint
      };
    });

  return {
    category: String(category || "").trim().toLowerCase(),
    transactions: transactions,
    nextCursor: nextCursor,
    hasMore: nextCursor < totalDataRows
  };
}

function getGcashBusinessTransactionsPageFromRows_(rows, category, cursor, limit) {
  var nextCursor = Math.max(0, Math.floor(Number(cursor) || 0));
  var safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var transactions = [];

  while (nextCursor < rows.length && transactions.length < safeLimit) {
    var matches = filterGcashBusinessTransactionsFromRows_([rows[nextCursor]], category);
    nextCursor += 1;

    if (matches.length) {
      matches[0].sourceOffset = nextCursor - 1;
      transactions.push(matches[0]);
    }
  }

  return {
    transactions: transactions,
    nextCursor: nextCursor,
    hasMore: nextCursor < rows.length
  };
}
export { parseExpense, resolveMoneyFlowCategory, parseRentalEntry_, parseTwiceAsNyceEntry_, parsePrintingEntry_, parseTestCashOutInput_, parseTestAapInput_, calculateTestAap_, buildTestAapRow_, parseTestTransferInput_, buildTestTransferInputRow_, parseTestOthersLoanInput_, buildTestOthersLoanRow_, buildTestLoanRows_, validateTestLoanAmount_, validateTestAtmAmount_, buildTestAtmRow_, computeTestDashboardFromRows_, filterTestTransactionsFromRows_, filterLifeLogTransactionsFromRows_, buildLifeLogMonthlyDashboardFromRows_, filterRentalTransactionsFromRows_, filterMoneyFlowTransactionsFromRows_, filterIncomeExpenseTransactionsFromRows_, filterGcashBusinessTransactionsFromRows_, computeCashInOutMonthlyTotalsFromRows_, getLifeLogDashboardData, getExpenseDashboardData, getRentalDashboardData, getTestDashboardData, getTwiceAsNyceDashboardData, getPrintingBusinessDashboardData, getGcashBusinessDashboardData, getTestFeeEarned_, buildTestCashOutRow_, getLifeLogTransactions, getRentalTransactions, getMoneyFlowTransactions, getTestTransactions, getIncomeExpenseTransactions, getGcashBusinessTransactions };

export function configureKonekSeed(seed) {
 if (!seed || !Number.isFinite(new Date(seed.reset_at).getTime())) throw new Error("Missing private Konek2Card balance settings.");
 if (!Number.isFinite(Number(seed.gcash))) throw new Error('Missing Konek2Card setting: gcash');
 TEST_START_GCASH_=Number(seed.gcash);
 if (!Number.isFinite(Number(seed.bank_card))) throw new Error('Missing Konek2Card setting: bank_card');
 TEST_START_BANK_CARD_=Number(seed.bank_card);
 if (!Number.isFinite(Number(seed.cash_on_hand))) throw new Error('Missing Konek2Card setting: cash_on_hand');
 TEST_START_CASH_ON_HAND_=Number(seed.cash_on_hand);
 if (!Number.isFinite(Number(seed.loan_remaining))) throw new Error('Missing Konek2Card setting: loan_remaining');
 TEST_START_LOAN_REMAINING_=Number(seed.loan_remaining);
 if (!Number.isFinite(Number(seed.others_loan))) throw new Error('Missing Konek2Card setting: others_loan');
 TEST_START_OTHERS_LOAN_=Number(seed.others_loan);
 if (!Number.isFinite(Number(seed.held_money))) throw new Error('Missing Konek2Card setting: held_money');
 TEST_START_HELD_MONEY_=Number(seed.held_money);
 if (!Number.isFinite(Number(seed.savings_included_in_total))) throw new Error('Missing Konek2Card setting: savings_included_in_total');
 TEST_START_SAVINGS_INCLUDED_IN_TOTAL_=Number(seed.savings_included_in_total);
 TEST_BALANCE_RESET_AT_=new Date(seed.reset_at);
}
