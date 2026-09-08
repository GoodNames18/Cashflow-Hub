// =========================================================
// MAIN EDIT TRIGGER
// =========================================================
const APP_RECENT_TRANSACTION_LIMIT = 10;

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

function get888TransactionDateNumberFormat_() {
  return "MMMM d, yyyy";
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

function expandPrintingDescriptionShortcut_(description) {
  var normalized = String(description || "").trim().toLowerCase();
  var shortcuts = { re: "Receipt", pr: "Print", xe: "Xerox" };
  return shortcuts[normalized] || toTitleCase_(description);
}

function onEdit(e) {
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  var range = e.range;


  // =======================================================
  // 1. 8.88% TRANSACTION
  // ONLY WORKS ON "8.88% Transaction"
  // =======================================================

  if (sheetName === "8.88% Transaction") {

    // Only respond if the edit includes Column C
    if (range.getColumn() <= 3 && range.getLastColumn() >= 3) {

      var startRow = Math.max(range.getRow(), 2);
      var endRow = range.getLastRow();

      for (var row = startRow; row <= endRow; row++) {

        var value = sheet.getRange(row, 3).getValue();
        var dateCell = sheet.getRange(row, 2);

        if (value !== "") {

          var today = new Date();

          dateCell.setValue(today);
          dateCell.setNumberFormat(get888TransactionDateNumberFormat_());

        } else {

          dateCell.clearContent();

        }
      }
    }

    return;
  }


  // =======================================================
  // 2. CALCULATOR
  // ONLY WORKS ON "Calculator"
  // =======================================================

  if (sheetName === "Calculator") {

    var startColumn = range.getColumn();
    var endColumn = range.getLastColumn();

    // Only react if E or F was edited
    if (endColumn < 5 || startColumn > 6) return;

    var startRow = Math.max(range.getRow(), 4);
    var endRow = range.getLastRow();

    for (var row = startRow; row <= endRow; row++) {

      // Only calculator denomination rows
      if (row > 12) continue;

      var currentCell = sheet.getRange(row, 3); // C
      var addCell = sheet.getRange(row, 5);     // E
      var minusCell = sheet.getRange(row, 6);   // F

      var currentValue = Number(currentCell.getValue()) || 0;
      var addValue = Number(addCell.getValue()) || 0;
      var minusValue = Number(minusCell.getValue()) || 0;


      // ADD
      if (addValue !== 0) {
        currentValue += addValue;
        addCell.clearContent();
      }


      // MINUS
      if (minusValue !== 0) {
        currentValue -= minusValue;
        minusCell.clearContent();
      }


      // Never allow negative quantity
      if (currentValue < 0) {
        currentValue = 0;
      }


      currentCell.setValue(currentValue);
    }

    return;
  }


  // =======================================================
  // ALL OTHER SHEETS
  // Income / Expense category alignment for supported sheets
  // =======================================================

  handleIncomeExpenseCategoryAlignmentEdit_(range);

  // Keep the Konek2Card sheet dashboards current after manual ledger edits
  // or after choosing a different year in the yearly dashboard.
  if (sheetName === "Konek2Card") {
    var touchesLedger =
      range.getRow() <= Math.max(sheet.getLastRow(), 5) &&
      range.getLastRow() >= 5 &&
      range.getColumn() <= 8 &&
      range.getLastColumn() >= 2;

    var touchesYearSelector =
      range.getRow() <= 2 &&
      range.getLastRow() >= 2 &&
      range.getColumn() <= 23 &&
      range.getLastColumn() >= 20;

    var touchesMonthSelector =
      range.getRow() <= 2 &&
      range.getLastRow() >= 2 &&
      range.getColumn() <= 18 &&
      range.getLastColumn() >= 10;

    if (touchesLedger || touchesYearSelector || touchesMonthSelector) {
      getTestDashboardData();
    }
  }

  if (sheetName === "Life Log") {
    var touchesLifeLogRows = range.getLastRow() >= 5 && range.getColumn() <= 6 && range.getLastColumn() >= 2;
    var touchesLifeLogMonth = range.getRow() <= 2 && range.getLastRow() >= 2 && range.getColumn() <= 13 && range.getLastColumn() >= 8;
    if (touchesLifeLogRows || touchesLifeLogMonth) getLifeLogDashboardData();
  }

  return;
}


function onOpen(e) {
  // Rebuilds the current-year option automatically when a new year begins.
  getTestDashboardData();
  try {
    getLifeLogDashboardData();
  } catch (error) {
  }
}


// =========================================================
// TEST DASHBOARD ROW-DELETION REFRESH
// Right-click Delete row fires an installable On change trigger,
// not the simple onEdit trigger above.
// =========================================================

function shouldRefreshTestDashboardForChange_(e) {
  if (!e || String(e.changeType || '').toUpperCase() !== 'REMOVE_ROW') {
    return false;
  }

  var spreadsheet = e.source;
  var activeSheet = spreadsheet && spreadsheet.getActiveSheet
    ? spreadsheet.getActiveSheet()
    : null;

  return Boolean(activeSheet && activeSheet.getName() === TEST_SHEET_NAME_);
}


function handleTestDashboardChange(e) {
  if (!shouldRefreshTestDashboardForChange_(e)) return;
  getTestDashboardData();
}


function setupTestDashboardAutoRefresh() {
  var handlerName = 'handleTestDashboardChange';
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handlerName) {
      return 'Test dashboard auto-refresh is already installed.';
    }
  }

  ScriptApp.newTrigger(handlerName)
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  return 'Test dashboard auto-refresh installed.';
}


// =========================================================
// INCOME / EXPENSE CATEGORY ALIGNMENT
// Applies only to sheets that use Income / Expense categories.
// Income = LEFT, Expense / Expenses = RIGHT.
// Category column is detected from the row-4 "Category" header.
// =========================================================

var INCOME_EXPENSE_ALIGNMENT_SHEETS_ = {
  "TwiceAsNyce": true,
  "Printing Business": true,
  "Money Flow": true,
  "Konek2Card": true,
  "test": true
};


function isIncomeExpenseAlignmentSheet_(sheetName) {
  return Boolean(
    INCOME_EXPENSE_ALIGNMENT_SHEETS_[
      String(sheetName || "").trim()
    ]
  );
}


function getIncomeExpenseCategoryAlignment_(value) {
  var normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (normalized === "income") {
    return "left";
  }

  if (normalized === "collection") {
    return "center";
  }

  if (
    normalized === "expense" ||
    normalized === "expenses"
  ) {
    return "right";
  }

  return "";
}


function findIncomeExpenseCategoryColumn_(sheet) {
  if (!sheet) return 0;

  var lastColumn =
    Math.max(
      Number(sheet.getLastColumn()) || 0,
      1
    );

  var headers =
    sheet
      .getRange(4, 1, 1, lastColumn)
      .getDisplayValues()[0];

  for (var index = 0; index < headers.length; index++) {
    if (
      String(headers[index] || "")
        .trim()
        .toLowerCase() === "category"
    ) {
      return index + 1;
    }
  }

  return 0;
}


function columnNumberToLetter_(columnNumber) {
  var number = Number(columnNumber) || 0;
  var letters = "";

  while (number > 0) {
    var remainder = (number - 1) % 26;
    letters =
      String.fromCharCode(65 + remainder) +
      letters;
    number = Math.floor((number - 1) / 26);
  }

  return letters;
}


function alignIncomeExpenseCategoryRows_(
  sheet,
  startRow,
  numRows
) {
  if (!sheet) return;

  if (
    !isIncomeExpenseAlignmentSheet_(
      sheet.getName()
    )
  ) {
    return;
  }

  startRow = Math.max(Number(startRow) || 5, 5);
  numRows = Number(numRows) || 0;

  if (numRows <= 0) return;

  var categoryColumn =
    findIncomeExpenseCategoryColumn_(sheet);

  if (!categoryColumn) return;

  var categoryValues =
    sheet
      .getRange(
        startRow,
        categoryColumn,
        numRows,
        1
      )
      .getDisplayValues();

  var columnLetter =
    columnNumberToLetter_(categoryColumn);

  var incomeCells = [];
  var centerCells = [];
  var expenseCells = [];

  categoryValues.forEach(function(row, offset) {
    var alignment =
      getIncomeExpenseCategoryAlignment_(
        row[0]
      );

    var a1 =
      columnLetter +
      String(startRow + offset);

    if (alignment === "left") {
      incomeCells.push(a1);
    } else if (alignment === "center") {
      centerCells.push(a1);
    } else if (alignment === "right") {
      expenseCells.push(a1);
    }
  });

  if (incomeCells.length > 0) {
    sheet
      .getRangeList(incomeCells)
      .setHorizontalAlignment("left");
  }

  if (expenseCells.length > 0) {
    sheet
      .getRangeList(expenseCells)
      .setHorizontalAlignment("right");
  }

  if (centerCells.length > 0) {
    sheet
      .getRangeList(centerCells)
      .setHorizontalAlignment("center");
  }
}


function handleIncomeExpenseCategoryAlignmentEdit_(range) {
  if (!range) return;

  var sheet = range.getSheet();

  if (
    !isIncomeExpenseAlignmentSheet_(
      sheet.getName()
    )
  ) {
    return;
  }

  var categoryColumn =
    findIncomeExpenseCategoryColumn_(sheet);

  if (!categoryColumn) return;

  var editedStartColumn = range.getColumn();
  var editedEndColumn = range.getLastColumn();

  if (
    categoryColumn < editedStartColumn ||
    categoryColumn > editedEndColumn
  ) {
    return;
  }

  var startRow =
    Math.max(range.getRow(), 5);
  var endRow = range.getLastRow();

  if (endRow < 5) return;

  alignIncomeExpenseCategoryRows_(
    sheet,
    startRow,
    endRow - startRow + 1
  );
}


function setupIncomeExpenseCategoryAlignment() {
  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheetNames = [
    "TwiceAsNyce",
    "Printing Business",
    "Money Flow",
    "Konek2Card"
  ];

  sheetNames.forEach(function(sheetName) {
    var sheet =
      spreadsheet.getSheetByName(sheetName);

    if (!sheet) return;

    var lastRow = sheet.getLastRow();

    if (lastRow < 5) return;

    alignIncomeExpenseCategoryRows_(
      sheet,
      5,
      lastRow - 4
    );
  });

  return (
    "Income left / Expense right alignment applied to " +
    "TwiceAsNyce, Printing Business, Money Flow, and Konek2Card."
  );
}


// =========================================================
// 3. CALCULATOR MIDNIGHT RESET
// ONLY RESETS C4:C12 IN "Calculator"
// =========================================================

function resetCalculator() {

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Calculator");

  if (!sheet) return;

  sheet.getRange("C4:C12").setValue(0);
}



// =========================================================
// 4. EXPENSE WEB APP
// =========================================================

function doGet(e) {

  // =======================================================
  // EXTERNAL GITHUB REQUESTS
  // =======================================================

  if (e && e.parameter) {

    var action = String(e.parameter.action || "").trim();

    var callback = String(
      e.parameter.callback || "expenseCallback"
    );

    // Only allow a safe JavaScript callback name
    callback = callback.replace(
      /[^a-zA-Z0-9_$]/g,
      ""
    );

    if (!callback) {
      callback = "expenseCallback";
    }


    // =====================================================
    // LIFE LOG RECENT ENTRIES
    // =====================================================

    if (action === "lifeLogDashboard") {

      try {

        var lifeLogDashboard = getLifeLogDashboardData(
          Number(e.parameter.year || 0),
          Number(e.parameter.month || 0)
        );
        lifeLogDashboard.success = true;

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify(lifeLogDashboard) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify({
              success: false,
              error: String(error.message || error)
            }) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    if (action === "lifeLogTransactions") {
      try {
        var lifeLogTransactions = getLifeLogTransactions(
          String(e.parameter.filter || "").trim(),
          Number(e.parameter.year || 0),
          Number(e.parameter.month || 0),
          String(e.parameter.issue || ""),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        lifeLogTransactions.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(lifeLogTransactions) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    if (action === "rentalAdd") {
      try {
        var rentalAddResult = addRentalEntry(
          String(e.parameter.text || ""),
          String(e.parameter.category || ""),
          String(e.parameter.entryType || "")
        );
        rentalAddResult.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(rentalAddResult) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    if (action === "rentalDashboard") {
      try {
        var rentalDashboard = getRentalDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));
        rentalDashboard.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(rentalDashboard) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    if (action === "rentalTransactions") {
      try {
        var rentalTransactions = getRentalTransactions(
          String(e.parameter.category || ""),
          String(e.parameter.filter || ""),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        rentalTransactions.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(rentalTransactions) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }


    // =====================================================
    // LIFE LOG SAVE
    // =====================================================

    if (action === "lifeLogAdd") {

      try {

        var lifeLogResult = addLifeLogEntry(
          String(e.parameter.description || "").trim(),
          String(e.parameter.category || "").trim()
        );

        lifeLogResult.success = true;

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify(lifeLogResult) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify({
              success: false,
              error: String(error.message || error)
            }) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }


    // =====================================================
    // SAVE EXPENSE / INCOME
    // =====================================================

    if (action === "expense") {

      try {

        var voiceText = String(
          e.parameter.text || ""
        ).trim();

        if (!voiceText) {
          throw new Error(
            "No expense text received."
          );
        }

        var entryType = String(
          e.parameter.entryType || ""
        ).trim();

        var result = addVoiceExpense(
          voiceText,
          entryType
        );

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(result) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        var expenseError = {
          success: false,
          error: String(
            error.message || error
          )
        };

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(expenseError) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }


    // =====================================================
    // PHONE DASHBOARD
    // =====================================================

    if (action === "dashboard") {

      try {

        var dashboardData =
          getExpenseDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));

        dashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(dashboardData) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        var dashboardError = {
          success: false,
          error: String(
            error.message || error
          )
        };

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(dashboardError) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    if (action === "moneyFlowTransactions") {
      try {
        var moneyFlowTransactions = getMoneyFlowTransactions(
          String(e.parameter.filter || "").trim(),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        moneyFlowTransactions.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(moneyFlowTransactions) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

        // =====================================================
    // GCASH BUSINESS DASHBOARD
    // =====================================================

    if (action === "gcashDashboard") {

      try {

        var gcashDashboardData =
          getGcashBusinessDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));

        gcashDashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(gcashDashboardData) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        var gcashDashboardError = {
          success: false,
          error: String(
            error.message || error
          )
        };

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(gcashDashboardError) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }




    // =====================================================
    // CASH IN/OUT FILTERED TRANSACTIONS
    // =====================================================

    if (action === "gcashTransactions") {

      try {

        var gcashTransactionsData = getGcashBusinessTransactions(
          String(e.parameter.category || "").trim(),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        gcashTransactionsData.success = true;

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify(gcashTransactionsData) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback + "(" + JSON.stringify({
              success: false,
              error: String(error.message || error)
            }) + ");"
          )
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }


    // =====================================================
    // KONEK2CARD DASHBOARD
    // =====================================================

    if (action === "konekDashboard") {

      try {

        var konekDashboardData =
          getKonek2CardDashboardData();

        konekDashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(
              konekDashboardData
            ) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    if (action === "testTransactions") {
      try {
        var testTransactions = getTestTransactions(
          String(e.parameter.filter || "").trim(),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        testTransactions.success = true;
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify(testTransactions) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService.createTextOutput(
          callback + "(" + JSON.stringify({ success: false, error: String(error.message || error) }) + ");"
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // KONEK2CARD AUTOCOMPLETE SUGGESTIONS
    // =====================================================

    if (action === "konekSuggestions") {

      try {

        var konekSuggestionsData =
          getKonek2CardSuggestions();

        konekSuggestionsData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(
              konekSuggestionsData
            ) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }


    // =====================================================
    // KONEK2CARD QUICK SAVE
    // =====================================================

    if (action === "konekAdd") {

      try {

        var konekText =
          String(
            e.parameter.text || ""
          ).trim();

        var konekCategory =
          String(
            e.parameter.category || ""
          ).trim();

        var konekAmount =
          Number(
            e.parameter.amount || 0
          );

        var konekResult =
          addKonek2CardEntry(
            konekText,
            konekCategory,
            konekAmount
          );

        konekResult.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(konekResult) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    // =====================================================
    // TEST DASHBOARD
    // =====================================================

    if (action === "testDashboard") {

      try {

        var testDashboardData =
          getTestDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));

        testDashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(
              testDashboardData
            ) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    // =====================================================
    // TEST CASH-OUT SAVE
    // =====================================================

    if (action === "testCashOut") {
      try {
        var testCashOutText = String(e.parameter.text || "").trim();
        var testCashOutResult = addTestCashOut_(testCashOutText);
        testCashOutResult.dashboard = getTestDashboardData();
        testCashOutResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testCashOutResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TEST AAP COLLECTION
    // =====================================================

    if (action === "testAapCollection") {
      try {
        var testAapText = String(e.parameter.text || "").trim();
        var testAapDestination = String(e.parameter.destination || "cash").trim();
        var testAapResult = addTestAapCollection_(testAapText, testAapDestination);
        testAapResult.dashboard = getTestDashboardData();
        testAapResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testAapResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TEST BALANCE TRANSFER
    // =====================================================

    if (action === "testTransfer") {
      try {
        var testTransferText = String(e.parameter.text || e.parameter.amount || "").trim();
        var testTransferDirection = String(e.parameter.direction || "").trim();
        var testTransferResult = addTestTransfer_(testTransferText, testTransferDirection);
        testTransferResult.dashboard = getTestDashboardData();
        testTransferResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testTransferResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TEST OTHERS LOAN ADD / MINUS
    // =====================================================

    if (action === "testOthersLoan") {
      try {
        var testOthersLoanText = String(e.parameter.text || "").trim();
        var testOthersLoanAction = String(e.parameter.loanAction || "").trim();
        var testOthersLoanResult = addTestOthersLoan_(testOthersLoanText, testOthersLoanAction);
        testOthersLoanResult.dashboard = getTestDashboardData();
        testOthersLoanResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testOthersLoanResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TEST ₱415 LOAN
    // =====================================================

    if (action === "testLoan") {
      try {
        var testLoanResult = addTestLoan_();
        testLoanResult.dashboard = getTestDashboardData();
        testLoanResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testLoanResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TEST ATM WITHDRAW
    // =====================================================

    if (action === "testAtmWithdraw") {
      try {
        var testAtmAmount = Number(e.parameter.amount || 0);
        var testAtmResult = addTestAtmWithdraw_(testAtmAmount);
        testAtmResult.dashboard = getTestDashboardData();
        testAtmResult.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(testAtmResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }


    // =====================================================
    // TWICEASNYCE DASHBOARD
    // =====================================================

    if (action === "twiceDashboard") {

      try {

        var twiceDashboardData =
          getTwiceAsNyceDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));

        twiceDashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(
              twiceDashboardData
            ) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    if (action === "twiceTransactions") {
      try {
        var twiceTransactionsData = getIncomeExpenseTransactions(
          "TwiceAsNyce",
          String(e.parameter.category || "").trim(),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        twiceTransactionsData.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(twiceTransactionsData) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // TWICEASNYCE SAVE
    // =====================================================

    if (action === "twiceAdd") {

      try {

        var twiceText =
          String(
            e.parameter.text || ""
          ).trim();

        var twiceCategory =
          String(
            e.parameter.category || ""
          ).trim();

        var twiceResult =
          addTwiceAsNyceEntry(
            twiceText,
            twiceCategory
          );

        twiceResult.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(twiceResult) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    // =====================================================
    // PRINTING BUSINESS DASHBOARD
    // =====================================================

    if (action === "printingDashboard") {

      try {

        var printingDashboardData =
          getPrintingBusinessDashboardData(Number(e.parameter.year || 0), Number(e.parameter.month || 0));

        printingDashboardData.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(
              printingDashboardData
            ) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

    if (action === "printingTransactions") {
      try {
        var printingTransactionsData = getIncomeExpenseTransactions(
          "Printing Business",
          String(e.parameter.category || "").trim(),
          Number(e.parameter.cursor || 0),
          Number(e.parameter.limit || 50)
        );
        printingTransactionsData.success = true;
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify(printingTransactionsData) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (error) {
        return ContentService
          .createTextOutput(callback + "(" + JSON.stringify({
            success: false,
            error: String(error.message || error)
          }) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    // =====================================================
    // PRINTING BUSINESS SAVE
    // =====================================================

    if (action === "printingAdd") {

      try {

        var printingText =
          String(
            e.parameter.text || ""
          ).trim();

        var printingCategory =
          String(
            e.parameter.category || ""
          ).trim();

        var printingResult =
          addPrintingBusinessEntry(
            printingText,
            printingCategory
          );

        printingResult.success = true;

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify(printingResult) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );

      } catch (error) {

        return ContentService
          .createTextOutput(
            callback +
            "(" +
            JSON.stringify({
              success: false,
              error: String(
                error.message || error
              )
            }) +
            ");"
          )
          .setMimeType(
            ContentService.MimeType.JAVASCRIPT
          );
      }
    }

  }

// =====================================================
// GCASH BUSINESS QUICK ADD
// =====================================================

if (action === "gcashQuickAdd") {

  try {

    var gcashCategory =
      String(e.parameter.category || "").trim();

    var gcashAmount =
      Number(e.parameter.amount || 0);


    var quickResult =
      addGcashBusinessQuickEntry(
        gcashCategory,
        gcashAmount
      );


    quickResult.success = true;


    return ContentService
      .createTextOutput(
        callback +
        "(" +
        JSON.stringify(quickResult) +
        ");"
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );


  } catch (error) {

    var quickError = {
      success: false,
      error: String(
        error.message || error
      )
    };


    return ContentService
      .createTextOutput(
        callback +
        "(" +
        JSON.stringify(quickError) +
        ");"
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );
  }
}


  // =====================================================
// CASH IN/OUT TEXT ENTRY
// Example: 30 gcash
// =====================================================

if (action === "gcashTextAdd") {

  try {

    var gcashText =
      String(
        e.parameter.text || ""
      ).trim();

    var gcashTextCategory =
      String(
        e.parameter.category || ""
      ).trim();


    var textResult =
      addGcashBusinessTextEntry(
        gcashText,
        gcashTextCategory
      );


    textResult.success = true;


    return ContentService
      .createTextOutput(
        callback +
        "(" +
        JSON.stringify(textResult) +
        ");"
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );


  } catch (error) {

    var textError = {
      success: false,
      error: String(
        error.message || error
      )
    };


    return ContentService
      .createTextOutput(
        callback +
        "(" +
        JSON.stringify(textError) +
        ");"
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );
  }
}

  // =======================================================
  // OLD APPS SCRIPT PAGE
  // Keep this as a fallback.
  // =======================================================

  return HtmlService
    .createHtmlOutputFromFile("Cashflow Hub")
    .setTitle("Cashflow Hub")
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1"
    );
}



// =========================================================
// LIFE LOG
// =========================================================

function validateLifeLogEntry_(description, category) {
  var cleanDescription = String(description || "").trim();
  var cleanCategory = String(category || "").trim();
  var allowedCategories = ["Health", "Grooming", "Home", "Device", "Other"];

  if (!cleanDescription) {
    throw new Error("Life Log description is required.");
  }

  if (allowedCategories.indexOf(cleanCategory) === -1) {
    throw new Error("Choose a valid Life Log category.");
  }

  return {
    category: cleanCategory,
    description: cleanDescription
  };
}


function getLifeLogColumnLayout_() {
  return {
    startColumn: 2,
    columnCount: 5,
    headers: ["Date", "Time", "Category", "Description", "Duration / Notes"]
  };
}


function getLifeLogDateNumberFormat_() {
  return "MMMM dd, yyyy";
}


function ensureLifeLogSheetLayout_(sheet) {
  var layout = getLifeLogColumnLayout_();
  var scanRowCount = Math.min(Math.max(sheet.getLastRow(), 4), 10);
  var values = sheet
    .getRange(1, layout.startColumn, scanRowCount, layout.columnCount)
    .getDisplayValues();
  var headerRow = 0;

  values.some(function(row, index) {
    if (String(row[0] || "").trim().toLowerCase() === "date") {
      headerRow = index + 1;
      return true;
    }
    return false;
  });

  if (!headerRow) headerRow = 4;

  sheet
    .getRange(headerRow, layout.startColumn, 1, layout.columnCount)
    .setValues([layout.headers]);

  return {
    headerRow: headerRow,
    startColumn: layout.startColumn,
    columnCount: layout.columnCount
  };
}


function applyLifeLogDataBorders_(sheet, startRow, rowCount, layout) {
  if (rowCount <= 0) return;

  sheet
    .getRange(startRow, layout.startColumn, rowCount, layout.columnCount)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#434343",
      SpreadsheetApp.BorderStyle.SOLID
    );
}


function addLifeLogEntry(description, category) {
  var entry = validateLifeLogEntry_(description, category);
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Life Log");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Life Log".');
  }

  var layout = ensureLifeLogSheetLayout_(sheet);
  var now = new Date();
  var nextRow = Math.max(sheet.getLastRow() + 1, layout.headerRow + 1);

  sheet.getRange(nextRow, layout.startColumn, 1, layout.columnCount).setValues([
    [now, now, entry.category, entry.description, ""]
  ]);
  sheet.getRange(nextRow, layout.startColumn).setNumberFormat(getLifeLogDateNumberFormat_());
  sheet.getRange(nextRow, layout.startColumn + 1).setNumberFormat("hh:mm AM/PM");
  applyLifeLogDataBorders_(sheet, nextRow, 1, layout);

  return entry;
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
        notes: String(row[4] || "").trim()
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


function normalizeLifeLogIssueKey_(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildLifeLogMonthlyDashboardFromRows_(rows, year, month) {
  var selectedYear = Number(year);
  var selectedMonth = Number(month);
  var monthStart = new Date(selectedYear, selectedMonth - 1, 1).getTime();
  var nextMonth = new Date(selectedYear, selectedMonth, 1).getTime();
  var counts = { Health: 0, Grooming: 0, Home: 0, Device: 0, Other: 0 };
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

function filterLifeLogTransactionsFromRows_(rows, filter, year, month, issue) {
  var normalizedFilter = String(filter || "").trim().toLowerCase();
  var allowed = ["total", "health", "grooming", "home", "device", "other", "common-health", "latest-health"];
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
        notes: entry.notes
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

function getLifeLogTransactions(filter, year, month, issue, cursor, limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Life Log");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Life Log".');
  var layout = ensureLifeLogSheetLayout_(sheet);
  var rows = sheet.getLastRow() > layout.headerRow
    ? sheet.getRange(layout.headerRow + 1, layout.startColumn, sheet.getLastRow() - layout.headerRow, layout.columnCount).getValues() : [];
  var all = filterLifeLogTransactionsFromRows_(rows, filter, year, month, issue);
  var start = Math.max(0, Math.floor(Number(cursor) || 0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start, start + size).map(function(entry) {
    return {
      date: Utilities.formatDate(entry.dateValue, timeZone, "MMMM d, yyyy"),
      time: entry.timeValue instanceof Date ? Utilities.formatDate(entry.timeValue, timeZone, "hh:mm a") : "",
      category: entry.category, description: entry.description, notes: entry.notes
    };
  });
  return { transactions: page, nextCursor: start + page.length, hasMore: start + page.length < all.length };
}

function refreshLifeLogSheetDashboard_(sheet, rows, dashboard, monthOptions) {
  var selectedLabel = String(sheet.getRange("H2").getDisplayValue() || "").trim();
  var selected = monthOptions.filter(function(option) { return option.label.toLowerCase() === selectedLabel.toLowerCase(); })[0];
  if (!selected) selected = { year: dashboard.selectedYear, month: dashboard.selectedMonth, label: dashboard.monthLabel };
  var summary = buildLifeLogMonthlyDashboardFromRows_(rows, selected.year, selected.month);
  var timeZone = Session.getScriptTimeZone();
  sheet.getRange("H2:M2").getMergedRanges().forEach(function(range) { range.breakApart(); });
  sheet.getRange("H2:M2").merge();
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(monthOptions.map(function(option) { return option.label; }), true).setAllowInvalid(false).build();
  sheet.getRange("H2").setDataValidation(rule).setValue(selected.label).setHorizontalAlignment("center");
  sheet.getRange("H3:M3").setValues([["Total Logs", "Health", "Grooming", "Home", "Device", "Other"]]);
  sheet.getRange("H4:M4").setValues([[
    summary.totalLogs, summary.counts.Health, summary.counts.Grooming,
    summary.counts.Home, summary.counts.Device, summary.counts.Other
  ]]);
  sheet.getRange("O2:R2").getMergedRanges().forEach(function(range) { range.breakApart(); });
  sheet.getRange("O2:R2").merge().setValue("HEALTH INSIGHTS").setHorizontalAlignment("center");
  sheet.getRange("O3:R3").setValues([["Most Common Health Issue", "Number of Times", "Latest Health Log", "Latest Health Date"]]);
  sheet.getRange("O4:R4").setValues([[
    summary.mostCommonHealthIssue || "No Health logs", summary.mostCommonHealthCount,
    summary.latestHealthLog || "No Health logs",
    summary.latestHealthDateValue instanceof Date ? Utilities.formatDate(summary.latestHealthDateValue, timeZone, "MMMM d, yyyy") : ""
  ]]);
  sheet.getRange("H2:M4").setBorder(true, true, true, true, true, true, "#434343", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange("O2:R4").setBorder(true, true, true, true, true, true, "#434343", SpreadsheetApp.BorderStyle.SOLID);
}


function normalizeLifeLogImportDate_(value) {
  var match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";

  var year = Number(match[3]);
  if (year < 100) year += 2000;

  return String(Number(match[1])).padStart(2, "0") + "/" +
    String(Number(match[2])).padStart(2, "0") + "/" + year;
}


function normalizeLifeLogImportTime_(value) {
  var match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return "";

  var hour = Number(match[1]);
  if (hour === 0) hour = 12;

  return String(hour).padStart(2, "0") + ":" + match[2] + " " + match[3].toUpperCase();
}


function buildLifeLogImportKey_(date, time, category, description, notes) {
  return [
    normalizeLifeLogImportDate_(date),
    normalizeLifeLogImportTime_(time),
    String(category || "").trim().toLowerCase(),
    String(description || "").trim().replace(/\s+/g, " ").toLowerCase(),
    String(notes || "").trim().replace(/\s+/g, " ").toLowerCase()
  ].join("|");
}


function getExistingLifeLogImportRecords_() {
  return [
    ["08/22/26", "08:00 AM", "Health", "sakit kanan dibdin"],
    ["08/03/26", "08:00 AM", "Health", "Sipon"],
    ["07/28/26", "08:50 PM", "Health", "sakit tagiliran"],
    ["07/22/26", "08:00 PM", "Health", "sakit gilid dibdib naka upo"],
    ["07/21/26", "09:00 PM", "Health", "sakit gilid dibdib nakahiga"],
    ["07/12/26", "08:00 AM", "Health", "cut mustache & beard"],
    ["07/11/26", "08:00 AM", "Health", "cut nails"],
    ["05/31/26", "12:00 PM", "Health", "after kumain sumakit gilid nang dibdib"],
    ["05/30/26", "11:00 AM", "Health", "after kumain sumakit gilid nang dibdib"],
    ["05/29/26", "08:00 PM", "Health", "after kumain sumakit gilid nang dibdib"],
    ["05/01/26", "08:00 PM", "Health", "Sakit around puso"],
    ["05/01/26", "08:00 AM", "Health", "Sipon"],
    ["04/30/26", "08:00 AM", "Health", "Sipon"],
    ["04/29/26", "08:00 AM", "Health", "Sipon"],
    ["04/28/26", "08:00 AM", "Health", "Sipon"],
    ["04/27/26", "08:00 AM", "Health", "Sipon"],
    ["04/22/26", "08:57 PM", "Health", "sakit dibsib left side"],
    ["04/12/26", "08:30 PM", "Health", "sakit kaliwa tagiliran"],
    ["04/09/26", "08:00 AM", "Health", "nanginginig kamay at para sinok"],
    ["03/26/26", "08:00 AM", "Health", "sakit tuhod"],
    ["03/07/26", "08:00 AM", "Health", "sakit at init katawan"],
    ["03/06/26", "08:00 AM", "Health", "nag tatae"],
    ["03/05/26", "08:00 AM", "Health", "nag tatae"],
    ["03/04/26", "08:00 AM", "Health", "nag tatae"],
    ["03/03/26", "08:00 AM", "Health", "Sakit buong katawan"],
    ["02/16/26", "08:00 AM", "Health", "Malat boses"],
    ["02/15/26", "08:00 AM", "Health", "Malat boses"],
    ["02/14/26", "08:00 AM", "Health", "Malat boses"],
    ["02/13/26", "08:00 AM", "Health", "Malat boses"],
    ["02/06/26", "08:00 AM", "Health", "sipon"],
    ["01/31/26", "08:00 AM", "Health", "ubo plema"],
    ["01/30/26", "08:00 AM", "Health", "ubo plema"],
    ["01/29/26", "08:00 AM", "Health", "ubo plema"],
    ["01/28/26", "08:00 AM", "Health", "ubo plema"],
    ["01/27/26", "08:00 AM", "Health", "ubo plema"],
    ["01/26/26", "08:00 AM", "Health", "ubo plema"],
    ["01/25/26", "08:00 AM", "Health", "ubo plema"],
    ["01/24/26", "08:00 AM", "Health", "ubo plema"],
    ["01/23/26", "08:00 AM", "Health", "uno plema"],
    ["01/22/26", "08:00 AM", "Health", "plema"],
    ["01/21/26", "08:00 AM", "Health", "ubo at plema"],
    ["01/20/26", "08:00 AM", "Health", "ubo at plema"],
    ["01/18/26", "00:00 AM", "Health", "Sipon"],
    ["01/07/26", "00:00 AM", "Health", "Sipon"],
    ["12/24/25", "01:20 PM", "Health", "Anti rabbies"],
    ["12/17/25", "08:00 AM", "Health", "Sipon at ko yung lagnat"],
    ["12/16/25", "03:00 PM", "Health", "sipon"],
    ["12/16/25", "08:00 AM", "Health", "Anti Rabbies at emergency"],
    ["12/13/25", "09:00 PM", "Health", "kalmot nang pusa sa likod nang paa"],
    ["12/13/25", "07:45 PM", "Health", "Sakit lalamunan"],
    ["12/12/25", "07:25 PM", "Health", "Sakit lalamunan"],
    ["11/25/25", "12:40 AM", "Health", "Sakit lalamunan"],
    ["11/10/25", "09:00 AM", "Health", "Sipon"],
    ["11/09/25", "11:00 AM", "Health", "Sipon"],
    ["11/08/25", "09:00 AM", "Health", "Sipon at bahing"],
    ["11/04/25", "11:00 AM", "Health", "Sipon"],
    ["11/03/25", "08:00 PM", "Health", "Sipon", "Ended immediately"],
    ["10/27/25", "06:07 PM", "Health", "Sipon (After bumahing)", "Ended immediately"],

    ["07/31/26", "", "Grooming", "Haircut"],
    ["06/21/26", "", "Grooming", "Leg Hair removed"],
    ["06/19/26", "", "Grooming", "Mustache & Beard"],
    ["05/30/26", "", "Grooming", "Haircut"],
    ["04/30/26", "", "Grooming", "Haircut"],
    ["02/13/26", "", "Grooming", "Moustache, Beard & pubic hair removed"],
    ["01/18/25", "", "Grooming", "Haircut"],
    ["01/03/26", "", "Grooming", "Moustache Removed"],
    ["12/29/25", "", "Grooming", "Beard & Moustache Removed"],
    ["11/26/25", "12:59 PM", "Grooming", "Haircut"],
    ["10/30/25", "", "Grooming", "Beard & Moustache Removed"],

    ["07/28/26", "", "Home", "Chnange Bed Sheet & Pillow"],
    ["02/15/26", "", "Home", "Change Bed Sheet & Pillow"],
    ["12/29/25", "", "Home", "Change Bed Sheet"],

    ["02/20/26", "", "Device", "Change Phone Case"],
    ["03/16/25", "", "Device", "Semi clean system unit only"]
  ].map(function(record) {
    return {
      date: normalizeLifeLogImportDate_(record[0]),
      time: normalizeLifeLogImportTime_(record[1]),
      category: record[2],
      description: record[3],
      notes: record[4] || ""
    };
  });
}


function createLifeLogImportDateValue_(dateText) {
  var parts = normalizeLifeLogImportDate_(dateText).split("/");
  return new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
}


function createLifeLogImportTimeValue_(timeText) {
  var normalized = normalizeLifeLogImportTime_(timeText);
  if (!normalized) return "";

  var match = normalized.match(/^(\d{2}):(\d{2}) ([AP]M)$/);
  var hour = Number(match[1]);
  if (match[3] === "AM" && hour === 12) hour = 0;
  if (match[3] === "PM" && hour !== 12) hour += 12;

  return new Date(1899, 11, 30, hour, Number(match[2]), 0, 0);
}


function importExistingLifeLogEntries() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Life Log");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Life Log".');
  }

  var layout = ensureLifeLogSheetLayout_(sheet);
  var existingKeys = {};
  var lastRow = sheet.getLastRow();

  if (lastRow > layout.headerRow) {
    sheet.getRange(
      layout.headerRow + 1,
      layout.startColumn,
      lastRow - layout.headerRow,
      layout.columnCount
    ).getDisplayValues().forEach(function(row) {
      existingKeys[buildLifeLogImportKey_(row[0], row[1], row[2], row[3], row[4])] = true;
    });
  }

  var rowsToAdd = [];

  getExistingLifeLogImportRecords_().forEach(function(record) {
    var key = buildLifeLogImportKey_(
      record.date,
      record.time,
      record.category,
      record.description,
      record.notes
    );

    if (existingKeys[key]) return;

    rowsToAdd.push([
      createLifeLogImportDateValue_(record.date),
      createLifeLogImportTimeValue_(record.time),
      record.category,
      record.description,
      record.notes
    ]);
    existingKeys[key] = true;
  });

  if (rowsToAdd.length) {
    var startRow = Math.max(sheet.getLastRow() + 1, layout.headerRow + 1);
    sheet.getRange(startRow, layout.startColumn, rowsToAdd.length, layout.columnCount).setValues(rowsToAdd);
    sheet.getRange(startRow, layout.startColumn, rowsToAdd.length, 1).setNumberFormat(getLifeLogDateNumberFormat_());
    sheet.getRange(startRow, layout.startColumn + 1, rowsToAdd.length, 1).setNumberFormat("hh:mm AM/PM");
  }

  var finalLastRow = sheet.getLastRow();
  if (finalLastRow > layout.headerRow) {
    sheet
      .getRange(
        layout.headerRow + 1,
        layout.startColumn,
        finalLastRow - layout.headerRow,
        1
      )
      .setNumberFormat(getLifeLogDateNumberFormat_());
  }
  applyLifeLogDataBorders_(
    sheet,
    layout.headerRow + 1,
    Math.max(0, finalLastRow - layout.headerRow),
    layout
  );

  return {
    imported: rowsToAdd.length,
    skipped: getExistingLifeLogImportRecords_().length - rowsToAdd.length
  };
}


function addVoiceExpense(voiceText, entryType) {

  if (!voiceText || voiceText.trim() === "") {
    throw new Error("Walang expense na nakuha. Please speak again.");
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Money Flow");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Money Flow".');
  }

  var expense = parseExpense(voiceText);

  expense.category = resolveMoneyFlowCategory(
    expense.category,
    entryType
  );

  if (!expense.amount || expense.amount <= 0) {
    throw new Error(
      "Hindi ko makita ang amount. Example: '350 sa Jollibee, GCash.'"
    );
  }

  var now = new Date();


// =======================================================
// SHIFT ONLY TRANSACTION AREA B:I DOWN BY ONE ROW
// Dashboard K:V WILL NOT MOVE
// =======================================================

sheet.getRange("B5:I5")
  .insertCells(SpreadsheetApp.Dimension.ROWS);


// Write newest expense into B5:I5
sheet.getRange(5, 2, 1, 8).setValues([[
  now,                  // B - Date
  now,                  // C - Time
  expense.merchant,     // D - Merchant
  expense.description,  // E - Description
  expense.category,     // F - Category
  expense.amount,       // G - Amount
  expense.payment,      // H - Payment Method
  voiceText             // I - Voice Input
]]);

// Income = left, Expense / Expenses = right in the detected Category column.
alignIncomeExpenseCategoryRows_(sheet, 5, 1);


// =======================================================
// FORMAT NEW ROW 5
// =======================================================

var newRow = sheet.getRange(5, 2, 1, 8); // B5:I5

// Dark gray borders
newRow.setBorder(
  true,
  true,
  true,
  true,
  true,
  true,
  "#555555",
  SpreadsheetApp.BorderStyle.SOLID
);

// Date - center
sheet.getRange("B5")
  .setNumberFormat("MM/dd/yy")
  .setHorizontalAlignment("center");

// Time - center
sheet.getRange("C5")
  .setNumberFormat("hh:mm AM/PM")
  .setHorizontalAlignment("center");

// Amount - peso + left
sheet.getRange("G5")
  .setNumberFormat('₱#,##0.00')
  .setHorizontalAlignment("left");


  // Values returned to the phone page
  var dateText = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "MM/dd/yy"
  );

  var timeText = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "hh:mm a"
  );


  return {
    success: true,
    date: dateText,
    time: timeText,
    merchant: expense.merchant,
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    payment: expense.payment,
    original: voiceText
  };
}



// =========================================================
// 6. EXPENSE PARSER
// English + Tagalog + Taglish
// =========================================================

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



// =========================================================
// 7. AMOUNT EXTRACTION
// =========================================================

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



// =========================================================
// 8. PAYMENT METHOD DETECTION
// =========================================================

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



// =========================================================
// 9. CATEGORY DETECTION
// =========================================================

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



// =========================================================
// 10. MERCHANT EXTRACTION
// =========================================================

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



// =========================================================
// 11. KNOWN MERCHANT DETECTION
// =========================================================

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



// =========================================================
// 12. DESCRIPTION EXTRACTION
// =========================================================

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



// =========================================================
// 13. CLEAN MERCHANT
// =========================================================

function cleanMerchant(merchant) {

  if (!merchant) return "";


  merchant = merchant
    .replace(/\b(?:ng|mga)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();


  return merchant;
}



// =========================================================
// 14. CLEAN DESCRIPTION
// =========================================================

function cleanDescription(description) {

  if (!description) return "";


  return description
    .replace(/\s+/g, " ")
    .trim();
}


// =========================================================
// 15. PHONE DASHBOARD DATA
// Reads live transactions from Money Flow!B5:I
// =========================================================

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

    allTransactions++;

    if (monthKey === currentMonthKey) {
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

function addRentalEntry(text, category, entryType) {
  var entry = parseRentalEntry_(text, category, entryType);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rental");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Rental".');
  sheet.getRange("B4:G4").setValues([["Date", "Time", "Amount", "Type", "Category", "Description"]]);
  sheet.getRange("B5:G5").insertCells(SpreadsheetApp.Dimension.ROWS);
  var now = new Date();
  sheet.getRange(5, 2, 1, 6).setValues([[now, now, entry.amount, entry.type, entry.category, entry.description]]);
  sheet.getRange("B5").setNumberFormat("MM/dd/yy");
  sheet.getRange("C5").setNumberFormat("hh:mm AM/PM");
  sheet.getRange("D5").setNumberFormat("₱#,##0.00");
  sheet.getRange("B5:G5").setBorder(true, true, true, true, true, true, "#555555", SpreadsheetApp.BorderStyle.SOLID);
  return { amount: entry.amount, category: entry.category, type: entry.type, description: entry.description };
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
    return { timestamp: stamp.getTime(), dateValue: date, timeValue: time instanceof Date ? time : "", amount: amount, category: rowCategory, type: isExpense ? "Expense" : "Income", description: description, isExpense: isExpense };
  }).filter(Boolean).sort(function(a,b) { return b.timestamp - a.timestamp; });
}

function getRentalRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rental");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Rental".');
  return sheet.getLastRow() >= 5 ? sheet.getRange(5, 2, sheet.getLastRow() - 4, 6).getValues() : [];
}

function getRentalDashboardData(selectedYear, selectedMonth) {
  var rows = getRentalRows_();
  var now = new Date();
  var period = getAllowedDashboardPeriod_(selectedYear, selectedMonth, now);
  var monthStart = period.start.getTime();
  var nextMonth = period.next.getTime();
  var totalIncome = 0;
  function summary(category) {
    var all = filterRentalTransactionsFromRows_(rows, category, "transactions");
    var monthly = all.filter(function(item) { return item.timestamp >= monthStart && item.timestamp < nextMonth; });
    var income = monthly.filter(function(item) { return !item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    totalIncome += all.filter(function(item) { return !item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    var expenses = monthly.filter(function(item) { return item.isExpense; }).reduce(function(sum,item){ return sum + item.amount; },0);
    var totalMoney = all.reduce(function(sum,item){ return sum + (item.isExpense ? -item.amount : item.amount); },0);
    return { income: income, expenses: expenses, totalMoney: totalMoney, transactions: monthly.length };
  }
  var allRecent = filterRentalTransactionsFromRows_(rows, "Insta360", "transactions")
    .concat(filterRentalTransactionsFromRows_(rows, "Chair & Table", "transactions"))
    .filter(function(item){ return item.timestamp >= monthStart && item.timestamp < nextMonth; })
    .sort(function(a,b){ return b.timestamp - a.timestamp; }).slice(0, 10);
  var timeZone = Session.getScriptTimeZone();
  function display(item) { return { date: Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy"), time: item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", amount:item.amount, category:item.category, type:item.type, description:item.description, isExpense:item.isExpense }; }
  var categories = { insta360: summary("Insta360"), chairTable: summary("Chair & Table") };
  return { monthLabel: Utilities.formatDate(period.start,timeZone,"MMMM yyyy"), totalIncome: totalIncome, categories: categories, recentTransactions: allRecent.map(display) };
}

function getRentalTransactions(category, filter, cursor, limit) {
  var all = filterRentalTransactionsFromRows_(getRentalRows_(), category, filter);
  var start = Math.max(0, Math.floor(Number(cursor)||0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start,start+size).map(function(item){ return { date: Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy"), time:item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", amount:item.amount, category:item.category, type:item.type, description:item.description, isExpense:item.isExpense }; });
  return { transactions:page, nextCursor:start+page.length, hasMore:start+page.length<all.length };
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
    merchant: description, payment: payment, isExpense: !isIncome
  };
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

function getMoneyFlowTransactions(filter, cursor, limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Money Flow");
  if (!sheet) throw new Error('Hindi makita ang sheet na "Money Flow".');
  var rows = sheet.getLastRow() >= 5 ? sheet.getRange(5, 2, sheet.getLastRow() - 4, 8).getValues() : [];
  var all = filterMoneyFlowTransactionsFromRows_(rows, filter, new Date());
  var start = Math.max(0, Math.floor(Number(cursor) || 0));
  var size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start, start + size).map(function(item) {
    return {
      date: Utilities.formatDate(item.dateValue, timeZone, "MMM d, yyyy"),
      time: item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue, timeZone, "hh:mm a") : "",
      amount: item.amount, category: item.category, description: item.description,
      merchant: item.merchant, payment: item.payment, isExpense: item.isExpense
    };
  });
  return { filter: filter, transactions: page, nextCursor: start + page.length, hasMore: start + page.length < all.length };
}





// =========================================================
// KONEK2CARD QUICK ENTRY
// ₱7/₱12/₱22/₱32/₱52 = Income with required text.
// ₱415 = automatic two-row loan bundle:
//   Row 5: ₱415 Expense / Loan payment
//   Row 6: ₱50 Income  / Loan rebate
// =========================================================

var KONEK2CARD_ALLOWED_INCOME_AMOUNTS_ = [7, 12, 22, 32, 52];
var KONEK2CARD_LOAN_PAYMENT_AMOUNT_ = 415;

function getTestCurrencyNumberFormat_() {
  // ASCII-only source prevents the peso sign from becoming garbled after copying.
  return '\u20B1#,##0.00';
}

function validateKonek2CardEntry_(text, category, amount) {
  var numericAmount = Number(amount || 0);

  if (numericAmount === KONEK2CARD_LOAN_PAYMENT_AMOUNT_) {
    return {
      mode: "loanBundle",
      rows: [
        [415, "Expense", "Loan payment"],
        [50, "Income", "Loan rebate"]
      ]
    };
  }

  var description = String(text || "").trim();
  if (!description) {
    throw new Error("Konek2Card description is required.");
  }

  var categoryKey = String(category || "").trim().toLowerCase();
  if (categoryKey !== "income") {
    throw new Error("Only the ₱415 button can create an Expense automatically.");
  }

  if (KONEK2CARD_ALLOWED_INCOME_AMOUNTS_.indexOf(numericAmount) === -1) {
    throw new Error("Amount is not allowed for Konek2Card.");
  }

  return {
    mode: "single",
    description: description,
    category: "Income",
    amount: numericAmount
  };
}

function addKonek2CardEntry(text, category, amount) {
  var entry = validateKonek2CardEntry_(text, category, amount);
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Konek2Card");

  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "Konek2Card".');
  }

  var now = new Date();

  if (entry.mode === "loanBundle") {
    var inserted = false;
    try {
      sheet.getRange("B5:F6").insertCells(SpreadsheetApp.Dimension.ROWS);
      inserted = true;

      sheet.getRange(5, 2, 2, 5).setValues([
        [now, now, 415, "Expense", "Loan payment"],
        [now, now, 50, "Income", "Loan rebate"]
      ]);

      sheet.getRange(5, 2, 2, 5).setBorder(
        true, true, true, true, true, true,
        "#555555",
        SpreadsheetApp.BorderStyle.SOLID
      );

      sheet.getRange(5, 2, 2, 1)
        .setNumberFormat("MM/dd/yy")
        .setHorizontalAlignment("center");

      sheet.getRange(5, 3, 2, 1)
        .setNumberFormat("hh:mm AM/PM")
        .setHorizontalAlignment("center");

      sheet.getRange(5, 4, 2, 1)
        .setNumberFormat(getTestCurrencyNumberFormat_())
        .setHorizontalAlignment("left");

      alignIncomeExpenseCategoryRows_(sheet, 5, 2);
      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove(
        "KONEK2CARD_SUGGESTIONS_V1"
      );

      return {
        date: Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yy"),
        time: Utilities.formatDate(now, Session.getScriptTimeZone(), "hh:mm a"),
        bundle: true,
        entries: [
          {amount: 415, category: "Expense", description: "Loan payment"},
          {amount: 50, category: "Income", description: "Loan rebate"}
        ]
      };
    } catch (error) {
      if (inserted) {
        sheet.getRange("B5:F6").deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      }
      throw error;
    }
  }

  sheet.getRange("B5:F5").insertCells(SpreadsheetApp.Dimension.ROWS);
  sheet.getRange(5, 2, 1, 5).setValues([[
    now, now, entry.amount, entry.category, entry.description
  ]]);

  sheet.getRange(5, 2, 1, 5).setBorder(
    true, true, true, true, true, true,
    "#555555",
    SpreadsheetApp.BorderStyle.SOLID
  );

  sheet.getRange("B5").setNumberFormat("MM/dd/yy").setHorizontalAlignment("center");
  sheet.getRange("C5").setNumberFormat("hh:mm AM/PM").setHorizontalAlignment("center");
  sheet.getRange("D5").setNumberFormat(getTestCurrencyNumberFormat_()).setHorizontalAlignment("left");

  alignIncomeExpenseCategoryRows_(sheet, 5, 1);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(
    "KONEK2CARD_SUGGESTIONS_V1"
  );

  return {
    date: Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yy"),
    time: Utilities.formatDate(now, Session.getScriptTimeZone(), "hh:mm a"),
    bundle: false,
    amount: entry.amount,
    category: entry.category,
    description: entry.description
  };
}

function getKonek2CardSuggestions() {

  var cache =
    CacheService.getScriptCache();

  var cacheKey =
    "KONEK2CARD_SUGGESTIONS_V1";

  var cached =
    cache.get(cacheKey);

  if (cached) {
    try {
      return {
        suggestions: JSON.parse(cached)
      };
    } catch (error) {
      cache.remove(cacheKey);
    }
  }

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName(
      "Konek2Card"
    );

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Konek2Card".'
    );
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < 5) {
    return {
      suggestions: []
    };
  }

  // Column D is Customer. Return unique names alphabetically.
  var values =
    sheet
      .getRange(5, 4, lastRow - 4, 1)
      .getDisplayValues();

  var seen = {};
  var suggestions = [];

  for (var i = 0; i < values.length; i++) {

    var name = toTitleCase_(values[i][0]);

    if (!name) {
      continue;
    }

    var key = name.toLowerCase();

    if (seen[key]) {
      continue;
    }

    seen[key] = true;
    suggestions.push(name);

  }

  suggestions.sort(function(a, b) {
    return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  });
  suggestions = suggestions.slice(0, 1000);

  try {
    cache.put(
      cacheKey,
      JSON.stringify(suggestions),
      300
    );
  } catch (error) {
  }

  return {
    suggestions: suggestions
  };
}


function getKonek2CardDashboardData() {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName(
      "Konek2Card"
    );

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Konek2Card".'
    );
  }

  var timeZone =
    Session.getScriptTimeZone();

  var today = new Date();

  var monthStart =
    new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

  var nextMonthStart =
    new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      1
    );

  var income = 0;
  var expenses = 0;
  var transactions = 0;
  var recentTransactions = [];

  var lastRow = sheet.getLastRow();

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

      for (var i = 0; i < rows.length; i++) {

        var row = rows[i];
        var dateValue = row[0];
        var timeValue = row[1];
        var rowAmount =
          Math.abs(
            Number(row[2]) || 0
          );
        var rowCategory =
          String(row[3] || "")
            .trim();
        var description =
          String(row[4] || "")
            .trim();

        if (!dateValue || rowAmount <= 0) {
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
          rowCategory.toLowerCase();

        var isIncome =
          categoryLower === "income";

        var isExpense =
          categoryLower === "expense" ||
          categoryLower === "expenses";

        if (!isIncome && !isExpense) {
          continue;
        }

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
            amount: rowAmount,
            category: isIncome
              ? "Income"
              : "Expense",
            description: description,
            isExpense: isExpense
          });
        }

        if (
          transactionDate >= monthStart &&
          transactionDate < nextMonthStart
        ) {
          transactions++;

          if (isExpense) {
            expenses += rowAmount;
          } else {
            income += rowAmount;
          }

        } else if (
          transactionDate < monthStart
        ) {
          reachedOlderMonth = true;
        }
      }

      if (
        reachedOlderMonth &&
        recentTransactions.length >=
          APP_RECENT_TRANSACTION_LIMIT
      ) {
        break;
      }

      startRow += rowCount;
    }
  }

  return {
    monthLabel: Utilities.formatDate(
      today,
      timeZone,
      "MMMM yyyy"
    ),
    income: income,
    expenses: expenses,
    profit: income - expenses,
    transactions: transactions,
    recentTransactions: recentTransactions
  };
}


// =========================================================
// TEST QUICK ENTRY
// ₱7/₱12/₱22/₱32/₱52 = Income with required text.
// ₱415 = automatic two-row loan bundle:
//   Row 5: ₱415 Expense / Loan payment
//   Row 6: ₱50 Income  / Loan rebate
// =========================================================

var TEST_SHEET_NAME_ = 'Konek2Card';
var TEST_DISPLAY_NAME_ = 'Konek2Card';
var TEST_START_TOTAL_MONEY_ = 41918;
var TEST_START_CASH_ON_HAND_ = 40700;
var TEST_START_GCASH_ = 1176;
var TEST_START_CARD_ = 42;
var TEST_START_CASH_ON_APP_ = TEST_START_GCASH_ + TEST_START_CARD_;
var TEST_START_LOAN_REMAINING_ = 0;
var TEST_START_OTHERS_LOAN_ = 12000;
var TEST_LOAN_REDUCTION_ = 365;
var TEST_RECENT_LIMIT_ = 10;
var TEST_LEGACY_FEE_VALUES_ = [7, 12, 22, 32, 52];
var TEST_AAP_CUSTOMER_ = 'Batasan M3';
var TEST_AAP_FEE_PER_PERSON_ = 5;

function parseTestAapInput_(text) {
  var raw = String(text || '').replace(/\s+/g, ' ').trim();
  var match = raw.match(/^([\d,]+(?:\.\d{1,2})?)\s+(?:₱\s*)?([\d,]+(?:\.\d{1,2})?)$/);
  if (!match) throw new Error('Enter people and book total in either order, for example: 100 26432.');

  var first = Number(match[1].replace(/,/g, ''));
  var second = Number(match[2].replace(/,/g, ''));
  var people = Math.min(first, second);
  var bookTotal = Math.max(first, second);
  if (!isFinite(people) || people <= 0 || people % 1 !== 0) {
    throw new Error('Number of people must be a whole number greater than 0.');
  }
  if (!isFinite(bookTotal) || bookTotal <= 0) {
    throw new Error('Book total must be greater than 0.');
  }
  return { people: people, bookTotal: bookTotal };
}


function resolveMoneyFlowCategory(parsedCategory, entryType) {
  if (String(entryType || "").toLowerCase() === "income") {
    return "Income";
  }

  return parsedCategory || "Other";
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

function formatTestAapDescriptionAmount_(value) {
  var number = Number(value);
  var parts = number.toFixed(number % 1 === 0 ? 0 : 2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
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

function buildTestAapRow_(now, calculation, destination) {
  var target = normalizeTestAapDestination_(destination);
  return [
    now,
    now,
    TEST_AAP_CUSTOMER_,
    calculation.cashReceived,
    '',
    'Collection',
    buildTestAapDescription_(calculation, target)
  ];
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

function validateTestCashOutAmount_(amount) {
  var value = Number(amount);
  if (!isFinite(value)) throw new Error('Invalid cash-out amount.');
  if (value < 100) throw new Error('Minimum cash-out is ₱100.');
  if (value > 10000) throw new Error('Maximum cash-out is ₱10,000.');
  if (value % 100 !== 0) throw new Error('Amount must be in ₱100 increments.');
  return value;
}

function getTestFeeEarned_(amount) {
  var value = validateTestCashOutAmount_(amount);
  if (value <= 500) return 7;
  if (value <= 1000) return 12;
  if (value <= 2000) return 22;
  if (value <= 5000) return 32;
  return 52;
}

function isTestLegacyFeeValue_(value) {
  return TEST_LEGACY_FEE_VALUES_.indexOf(Number(value)) !== -1;
}

function migrateTestLegacyRow_(row) {
  var out = row.slice(0, 7);
  while (out.length < 7) out.push('');

  var customer = String(out[2] || '').trim();
  var amount = Number(out[3] || 0);
  var fee = Number(out[4] || 0);
  var category = String(out[5] || '').trim();
  var description = String(out[6] || '').trim();
  var isIncome = category.toLowerCase() === 'income';

  // New-format rows already identify the customer/source explicitly.
  if (customer) return out;

  // Current staging layout: old monetary values were moved into Fee Earned.
  if (fee > 0) {
    if (isIncome && isTestLegacyFeeValue_(fee)) {
      out[2] = description;
      out[3] = '';
      out[4] = fee;
      out[6] = '';
      return out;
    }

    out[3] = amount || fee;
    out[4] = '';
    return out;
  }

  // Original clone layout: old monetary value is still in Amount.
  if (amount > 0 && isIncome && isTestLegacyFeeValue_(amount)) {
    out[2] = description;
    out[3] = '';
    out[4] = amount;
    out[6] = '';
    return out;
  }

  out[4] = '';
  return out;
}

var TEST_REBUILD_VERSION_ = 'TEST_CASHOUT_REBUILD_V1';
// V2 deliberately creates a new Test-only cutoff for the approved fresh start.
// Rows recorded before this timestamp remain in the sheet but do not affect the
// new balances or earnings totals.
var TEST_LIVE_START_AT_KEY_ = 'TEST_LIVE_START_AT_V3';

function ensureTestCashOutSetup_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(TEST_SHEET_NAME_);
  if (!sheet) {
    throw new Error('Hindi makita ang sheet na "test".');
  }

  var properties = PropertiesService.getDocumentProperties();
  var migrated = properties.getProperty(TEST_REBUILD_VERSION_);

  sheet.getRange(4, 2, 1, 7).setValues([[
    'Date', 'Time', 'Customer', 'Amount', 'Fee Earned', 'Category', 'Description'
  ]]);

  if (!migrated) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 5) {
      var range = sheet.getRange(5, 2, lastRow - 4, 7);
      var rows = range.getValues();
      var migratedRows = rows.map(migrateTestLegacyRow_);
      range.setValues(migratedRows);
    }

    if (!properties.getProperty(TEST_LIVE_START_AT_KEY_)) {
      properties.setProperty(TEST_LIVE_START_AT_KEY_, new Date().toISOString());
    }
    properties.setProperty(TEST_REBUILD_VERSION_, '1');
  } else if (!properties.getProperty(TEST_LIVE_START_AT_KEY_)) {
    properties.setProperty(TEST_LIVE_START_AT_KEY_, new Date().toISOString());
  }

  formatTestLedgerRows_(sheet, 5, Math.max(0, sheet.getLastRow() - 4));
  SpreadsheetApp.flush();
}

function formatTestLedgerRows_(sheet, startRow, rowCount) {
  if (!rowCount || rowCount < 1) return;

  sheet.getRange(startRow, 2, rowCount, 1)
    .setNumberFormat('MM/dd/yy')
    .setHorizontalAlignment('center');
  sheet.getRange(startRow, 3, rowCount, 1)
    .setNumberFormat('hh:mm AM/PM')
    .setHorizontalAlignment('center');
  sheet.getRange(startRow, 5, rowCount, 2)
    .setNumberFormat(getTestCurrencyNumberFormat_());
  sheet.getRange(startRow, 2, rowCount, 7).setBorder(
    true, true, true, true, true, true,
    '#555555',
    SpreadsheetApp.BorderStyle.SOLID
  );
  alignIncomeExpenseCategoryRows_(sheet, startRow, rowCount);
}

function buildTestCashOutRow_(now, customer, amount, feeEarned) {
  return [now, now, customer, amount, feeEarned, 'Income', 'Cash-out'];
}

function buildTestLoanRows_(now) {
  return [
    [now, now, 'Me', 415, '', 'Expense', 'Loan payment'],
    [now, now, 'Me', 50, '', 'Income', 'Loan rebate']
  ];
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

function validateTestTransferAmount_(amount) {
  var value = Number(amount);
  if (!isFinite(value) || value <= 0) {
    throw new Error('Transfer amount must be greater than 0.');
  }
  return value;
}

function parseTestTransferNumber_(value) {
  var token = String(value || '').trim().toLowerCase();
  var kMatch = token.match(/^([0-9]+(?:\.[0-9]+)?)k$/);
  return kMatch ? Number(kMatch[1]) * 1000 : Number(token);
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

function buildTestCardDepositRow_(now, amount) {
  return [now, now, 'Card', validateTestTransferAmount_(amount), '', 'Transfer', 'Money to Card'];
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

function buildTestGcashAapProcessingDescription_(summary) {
  return 'AAP GCash to Card — ' + summary.people +
    ' people, ₱' + formatTestAapDescriptionAmount_(summary.bookTotal) +
    ' book, ₱' + formatTestAapDescriptionAmount_(summary.totalFee) +
    ' total fee';
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

function getTestOutstandingGcashAapReceipts_(rows, liveStartAt) {
  var liveStartMs = new Date(liveStartAt).getTime();
  var events = [];
  var sourceRows = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < sourceRows.length; i++) {
    var timestamp = getTestRowTimestamp_(sourceRows[i]);
    if (!isNaN(timestamp) && !isNaN(liveStartMs) && timestamp >= liveStartMs) {
      events.push({ row: sourceRows[i], ts: timestamp, index: i });
    }
  }
  events.sort(function(a, b) {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.index - b.index;
  });

  var outstanding = [];
  for (var j = 0; j < events.length; j++) {
    var aap = getTestAapCalculationFromRow_(events[j].row);
    if (aap && aap.receiptOnly && aap.collectionDestination === 'gcash') {
      outstanding.push(aap);
      continue;
    }

    var processed = getTestGcashAapProcessingFromRow_(events[j].row);
    if (!processed) continue;

    var consumedAmount = 0;
    var consumedPeople = 0;
    var consumedBook = 0;
    var consumedCount = 0;
    while (consumedCount < outstanding.length && consumedAmount < processed.cashReceived) {
      var receipt = outstanding[consumedCount];
      consumedAmount += receipt.cashReceived;
      consumedPeople += receipt.people;
      consumedBook += receipt.bookTotal;
      consumedCount++;
    }
    if (consumedAmount === processed.cashReceived &&
        consumedPeople === processed.people && consumedBook === processed.bookTotal) {
      outstanding.splice(0, consumedCount);
    }
  }
  return outstanding;
}

function getTestGcashAapProcessingForAmount_(rows, liveStartAt, amount) {
  var requested = validateTestTransferAmount_(amount);
  var receipts = getTestOutstandingGcashAapReceipts_(rows, liveStartAt);
  var people = 0;
  var bookTotal = 0;
  var cashReceived = 0;

  for (var i = 0; i < receipts.length && cashReceived < requested; i++) {
    people += receipts[i].people;
    bookTotal += receipts[i].bookTotal;
    cashReceived += receipts[i].cashReceived;
  }
  if (cashReceived !== requested) {
    throw new Error('Amount must match complete GCash collection receipts, oldest first.');
  }
  return calculateTestAap_(people, bookTotal);
}

function finalizeTestBalances_(card, cashOnHand, gcash, utangKayNanay, othersLoan) {
  var totalApp = Number(card) + Number(gcash);
  return {
    cashOnApp: totalApp,
    totalApp: totalApp,
    gcash: Number(gcash),
    card: Number(card),
    cashOnHand: cashOnHand,
    totalMoney: totalApp + Number(cashOnHand),
    utangKayNanay: Number(utangKayNanay || 0),
    othersLoan: Number(othersLoan || 0)
  };
}

function applyTestCashOutToBalances_(balances, amount, feeEarned) {
  if (Number(balances.cashOnHand) < amount) {
    throw new Error('Not enough Cash on Hand — borrow first');
  }
  return finalizeTestBalances_(
    Number(balances.card) + amount + feeEarned,
    Number(balances.cashOnHand) - amount,
    Number(balances.gcash),
    Number(balances.utangKayNanay || 0),
    Number(balances.othersLoan || 0)
  );
}

function applyTestAtmToBalances_(balances, amount) {
  if (Number(balances.card) < amount) {
    throw new Error('Not enough Card balance.');
  }
  return finalizeTestBalances_(
    Number(balances.card) - amount,
    Number(balances.cashOnHand) + amount,
    Number(balances.gcash),
    Number(balances.utangKayNanay || 0),
    Number(balances.othersLoan || 0)
  );
}

function applyTestLoanToBalances_(balances) {
  if (Number(balances.card) < 415) {
    throw new Error('Not enough Card balance for ₱415 loan payment.');
  }
  return finalizeTestBalances_(
    Number(balances.card) - 415 + 50,
    Number(balances.cashOnHand),
    Number(balances.gcash),
    Number(balances.utangKayNanay || 0),
    Number(balances.othersLoan || 0)
  );
}

function applyTestTransferToBalances_(balances, amount, direction) {
  var value = validateTestTransferAmount_(amount);
  var normalized = normalizeTestTransferDirection_(direction);
  var cash = Number(balances.cashOnHand);
  var gcash = Number(balances.gcash);
  var card = Number(balances.card);
  var utangKayNanay = Number(balances.utangKayNanay || 0);

  if (normalized === 'cashToGcash') {
    if (cash < value) throw new Error('Not enough Cash on Hand.');
    cash -= value;
    gcash += value;
  } else if (normalized === 'gcashToCard') {
    if (gcash < value) throw new Error('Not enough GCash balance.');
    gcash -= value;
    card += value;
  } else if (normalized === 'cardToGcash') {
    if (card < value) throw new Error('Not enough Card balance.');
    card -= value;
    gcash += value;
  } else if (normalized === 'gcashToCash') {
    if (gcash < value) throw new Error('Not enough GCash balance.');
    gcash -= value;
    cash += value;
  } else if (normalized === 'nanayToCash') {
    cash += value;
    utangKayNanay += value;
  } else if (normalized === 'cashToNanay') {
    if (utangKayNanay < value) throw new Error('Amount is greater than Utang kay Nanay.');
    if (cash < value) throw new Error('Not enough Cash on Hand.');
    cash -= value;
    utangKayNanay -= value;
  }
  return finalizeTestBalances_(card, cash, gcash, utangKayNanay, balances.othersLoan);
}

function applyTestOthersLoanToBalances_(balances, entry) {
  var card = Number(balances.card || 0);
  var othersLoan = Number(balances.othersLoan || 0);
  if (entry.action === 'add') {
    card += entry.principal - entry.fee;
    othersLoan += entry.principal;
  } else {
    if (entry.principal > othersLoan) throw new Error('Payment is greater than Others Loan.');
    if (entry.principal > card) throw new Error('Not enough Money on Card.');
    card -= entry.principal;
    othersLoan -= entry.principal;
  }
  return finalizeTestBalances_(
    card,
    balances.cashOnHand,
    balances.gcash,
    balances.utangKayNanay,
    othersLoan
  );
}

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

function isTestLoanPaymentRow_(row) {
  var amount = Number(row && row[3] || 0);
  var category = String(row && row[5] || '').trim().toLowerCase();
  var description = String(row && row[6] || '').trim().toLowerCase();
  return amount === 415 &&
    (category === 'expense' || category === 'expenses') &&
    (description === 'loan' || description === 'loan payment');
}

function isTestLoanRebateRow_(row) {
  return Number(row && row[3] || 0) === 50 &&
    String(row && row[5] || '').trim().toLowerCase() === 'income' &&
    String(row && row[6] || '').trim().toLowerCase() === 'loan rebate';
}

function getTestEarnedFeeValue_(row) {
  var processing = getTestGcashAapProcessingFromRow_(row);
  if (processing) return processing.feeEarned;
  var aapCalculation = getTestAapCalculationFromRow_(row);
  if (aapCalculation) {
    return aapCalculation.receiptOnly ? 0 : aapCalculation.feeEarned;
  }
  var fee = Number(row && row[4] || 0);
  return isTestLegacyFeeValue_(fee) ? fee : 0;
}

function computeTestDashboardFromRows_(rows, liveStartAt, asOfDate) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var liveStartMs = new Date(liveStartAt).getTime();
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
  for (var j = 0; j < liveRows.length; j++) {
    var ts = getTestRowTimestamp_(liveRows[j]);
    events.push({ row: liveRows[j], ts: ts, index: j });
  }

  events.sort(function(a, b) {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.index - b.index;
  });

  var gcash = TEST_START_GCASH_;
  var card = TEST_START_CARD_;
  var cashOnHand = TEST_START_CASH_ON_HAND_;
  var loanRemaining = TEST_START_LOAN_REMAINING_;
  var utangKayNanay = 0;
  var othersLoan = TEST_START_OTHERS_LOAN_;

  for (var k = 0; k < events.length; k++) {
    var row = events[k].row;
    var amount = Number(row[3] || 0);
    var feeEarned = getTestEarnedFeeValue_(row);
    var category = String(row[5] || '').trim().toLowerCase();
    var description = String(row[6] || '').trim().toLowerCase();

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
      card -= 415;
      loanRemaining = Math.max(0, loanRemaining - TEST_LOAN_REDUCTION_);
      continue;
    }

    if (isTestLoanRebateRow_(row)) {
      card += 50;
    }
  }

  var totalApp = gcash + card;
  return {
    cashOnApp: totalApp,
    totalApp: totalApp,
    gcash: gcash,
    card: card,
    cashOnHand: cashOnHand,
    totalMoney: totalApp + cashOnHand,
    totalEarned: totalEarned,
    thisWeekEarned: thisWeekEarned,
    loanRemaining: Math.round(loanRemaining * 100) / 100,
    utangKayNanay: utangKayNanay,
    othersLoan: othersLoan
  };
}


function getTestYearOptions_(rows, liveStartAt, currentYear) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var liveStartMs = new Date(liveStartAt).getTime();
  var years = [];

  function addYear_(year) {
    var numericYear = Number(year);
    if (isFinite(numericYear) && years.indexOf(numericYear) === -1) {
      years.push(numericYear);
    }
  }

  addYear_(currentYear);

  for (var i = 0; i < sourceRows.length; i++) {
    var timestamp = getTestRowTimestamp_(sourceRows[i]);
    if (isNaN(timestamp)) continue;
    if (!isNaN(liveStartMs) && timestamp < liveStartMs) continue;
    addYear_(new Date(timestamp).getFullYear());
  }

  years.sort(function(a, b) {
    return b - a;
  });

  return years;
}


function getTestMonthOptions_(rows, liveStartAt, asOfDate) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var liveStartMs = new Date(liveStartAt).getTime();
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  var monthKeys = [];

  function addMonth_(date) {
    var year = date.getFullYear();
    var month = date.getMonth();
    var key = String(year) + '-' + String(month + 1).padStart(2, '0');
    if (monthKeys.indexOf(key) === -1) monthKeys.push(key);
  }

  addMonth_(now);

  for (var i = 0; i < sourceRows.length; i++) {
    var timestamp = getTestRowTimestamp_(sourceRows[i]);
    if (isNaN(timestamp)) continue;
    if (!isNaN(liveStartMs) && timestamp < liveStartMs) continue;
    addMonth_(new Date(timestamp));
  }

  monthKeys.sort(function(a, b) {
    return a < b ? 1 : a > b ? -1 : 0;
  });

  return monthKeys.map(function(key) {
    var parts = key.split('-');
    var year = Number(parts[0]);
    var monthIndex = Number(parts[1]) - 1;
    return {
      key: key,
      label: monthNames[monthIndex] + ' ' + year
    };
  });
}


function computeTestMonthlySummaryFromRows_(rows, liveStartAt, monthKey, asOfDate) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var parts = String(monthKey || '').split('-');
  var year = Number(parts[0]);
  var monthIndex = Number(parts[1]) - 1;
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var liveStartMs = new Date(liveStartAt).getTime();
  var monthStartMs = new Date(year, monthIndex, 1).getTime();
  var nextMonthStartMs = new Date(year, monthIndex + 1, 1).getTime();
  var cutoffExclusiveMs = Math.min(nextMonthStartMs, now.getTime() + 1);
  var rowsThroughMonthEnd = [];

  for (var i = 0; i < sourceRows.length; i++) {
    var timestamp = getTestRowTimestamp_(sourceRows[i]);
    if (isNaN(timestamp)) continue;
    if (!isNaN(liveStartMs) && timestamp < liveStartMs) continue;
    if (timestamp < cutoffExclusiveMs) rowsThroughMonthEnd.push(sourceRows[i]);
  }

  var dashboard = computeTestDashboardFromRows_(
    rowsThroughMonthEnd,
    liveStartAt,
    new Date(year, monthIndex, 1)
  );

  // Keep the selected month boundary explicit for future-dated rows.
  if (cutoffExclusiveMs <= monthStartMs) {
    dashboard.totalEarned = 0;
    dashboard.thisWeekEarned = 0;
  }

  return dashboard;
}


function computeTestYearlySummaryFromRows_(rows, liveStartAt, selectedYear, asOfDate) {
  var sourceRows = Array.isArray(rows) ? rows : [];
  var year = Number(selectedYear);
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var liveStartMs = new Date(liveStartAt).getTime();
  var yearStartMs = new Date(year, 0, 1).getTime();
  var nextYearStartMs = new Date(year + 1, 0, 1).getTime();
  var cutoffExclusiveMs = Math.min(nextYearStartMs, now.getTime() + 1);
  var rowsThroughYearEnd = [];
  var totalIncome = 0;

  for (var i = 0; i < sourceRows.length; i++) {
    var timestamp = getTestRowTimestamp_(sourceRows[i]);
    if (isNaN(timestamp)) continue;
    if (!isNaN(liveStartMs) && timestamp < liveStartMs) continue;

    if (timestamp < cutoffExclusiveMs) {
      rowsThroughYearEnd.push(sourceRows[i]);
    }

    if (timestamp >= yearStartMs && timestamp < cutoffExclusiveMs) {
      totalIncome += getTestEarnedFeeValue_(sourceRows[i]);
    }
  }

  var closingDashboard = computeTestDashboardFromRows_(
    rowsThroughYearEnd,
    liveStartAt,
    now
  );

  return {
    year: year,
    totalMoney: closingDashboard.totalMoney,
    totalIncome: totalIncome
  };
}

function getTestLiveBalances_() {
  ensureTestCashOutSetup_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
  if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 5
    ? sheet.getRange(5, 2, lastRow - 4, 7).getValues()
    : [];
  var properties = PropertiesService.getDocumentProperties();
  var liveStartAt = properties.getProperty(TEST_LIVE_START_AT_KEY_);
  var dashboard = computeTestDashboardFromRows_(rows, liveStartAt);

  return {
    cashOnApp: dashboard.cashOnApp,
    totalApp: dashboard.totalApp,
    gcash: dashboard.gcash,
    card: dashboard.card,
    cashOnHand: dashboard.cashOnHand,
    totalMoney: dashboard.totalMoney,
    utangKayNanay: dashboard.utangKayNanay,
    othersLoan: dashboard.othersLoan
  };
}

function addTestCashOut_(text) {
  ensureTestCashOutSetup_();
  var parsed = parseTestCashOutInput_(text);
  var amount = validateTestCashOutAmount_(parsed.amount);
  var feeEarned = getTestFeeEarned_(amount);
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var balances = getTestLiveBalances_();
    applyTestCashOutToBalances_(balances, amount, feeEarned);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

    var now = new Date();
    sheet.getRange('B5:H5').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 1, 7).setValues([
      buildTestCashOutRow_(now, parsed.customer, amount, feeEarned)
    ]);
    formatTestLedgerRows_(sheet, 5, 1);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      customer: parsed.customer,
      amount: amount,
      feeEarned: feeEarned,
      category: 'Income',
      description: 'Cash-out'
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H5').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function addTestLoan_() {
  ensureTestCashOutSetup_();
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var balances = getTestLiveBalances_();
    applyTestLoanToBalances_(balances);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

    var now = new Date();
    var rows = buildTestLoanRows_(now);
    sheet.getRange('B5:H6').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 2, 7).setValues(rows);
    formatTestLedgerRows_(sheet, 5, 2);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      entries: [
        { customer: 'Me', amount: 415, feeEarned: '', category: 'Expense', description: 'Loan payment' },
        { customer: 'Me', amount: 50, feeEarned: '', category: 'Income', description: 'Loan rebate' }
      ]
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H6').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function addTestAtmWithdraw_(amount) {
  ensureTestCashOutSetup_();
  var atmAmount = validateTestAtmAmount_(amount);
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var balances = getTestLiveBalances_();
    applyTestAtmToBalances_(balances, atmAmount);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

    var now = new Date();
    sheet.getRange('B5:H5').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 1, 7).setValues([
      buildTestAtmRow_(now, atmAmount)
    ]);
    formatTestLedgerRows_(sheet, 5, 1);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      customer: 'ATM',
      amount: atmAmount,
      feeEarned: '',
      category: 'Transfer',
      description: 'ATM withdrawal'
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H5').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
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
      description: description
    });
  }

  var result = {
    displayName: TEST_DISPLAY_NAME_,
    monthLabel: Utilities.formatDate(period.start, timeZone, 'MMMM yyyy'),
    totalMoney: dashboard.totalMoney,
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

  refreshTestSheetDashboard_(sheet, result, rows, liveStartAt, new Date());
  refreshTestYearlyDashboard_(sheet, rows, liveStartAt, new Date());
  return result;
}

function filterTestTransactionsFromRows_(rows, requestedFilter, liveStartAt) {
  var filter = String(requestedFilter || "").trim().toLowerCase();
  var allowed = ["total-money", "loan-remaining", "total-earned", "this-week-earned", "card", "cash", "gcash", "nanay", "others-loan"];
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
    else if (filter === "nanay") matches = /nanay/.test(text);
    else if (filter === "gcash") matches = /gcash/.test(text);
    else if (filter === "cash") matches = /cash/.test(text) || /atm withdrawal/.test(text);
    else if (filter === "card") matches = /card|cash-out|loan payment|loan rebate|atm withdrawal|others loan/.test(text);
    if (!matches || (amount <= 0 && fee <= 0)) return null;
    return {
      timestamp: ts, dateValue: row[0], timeValue: row[1] instanceof Date ? row[1] : "",
      customer: customer, amount: (filter === "total-earned" || filter === "this-week-earned") ? fee : amount,
      feeEarned: fee, category: category, description: description,
      isExpense: category.toLowerCase() === "expense" || category.toLowerCase() === "expenses"
    };
  }).filter(Boolean).sort(function(a,b){ return b.timestamp - a.timestamp; });
}

function getTestTransactions(filter, cursor, limit) {
  ensureTestCashOutSetup_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
  var rows = sheet.getLastRow() >= 5 ? sheet.getRange(5,2,sheet.getLastRow()-4,7).getValues() : [];
  var liveStartAt = PropertiesService.getDocumentProperties().getProperty(TEST_LIVE_START_AT_KEY_);
  var all = filterTestTransactionsFromRows_(rows, filter, liveStartAt);
  var start = Math.max(0,Math.floor(Number(cursor)||0));
  var size = Math.max(1,Math.min(50,Math.floor(Number(limit)||50)));
  var timeZone = Session.getScriptTimeZone();
  var page = all.slice(start,start+size).map(function(item){
    return { date: item.dateValue instanceof Date ? Utilities.formatDate(item.dateValue,timeZone,"MM/dd/yy") : String(item.dateValue || ""), time:item.timeValue instanceof Date ? Utilities.formatDate(item.timeValue,timeZone,"hh:mm a") : "", customer:item.customer, amount:item.amount, feeEarned:item.feeEarned, category:item.category, description:item.description, isExpense:item.isExpense };
  });
  return { transactions:page, nextCursor:start+page.length, hasMore:start+page.length<all.length };
}

function refreshTestSheetDashboard_(sheet, dashboard, rows, liveStartAt, asOfDate) {
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var monthOptions = getTestMonthOptions_(rows, liveStartAt, now);
  var selectedLabel = String(sheet.getRange('J2').getDisplayValue() || '')
    .trim()
    .toUpperCase();
  var selectedOption = null;

  for (var optionIndex = 0; optionIndex < monthOptions.length; optionIndex++) {
    if (monthOptions[optionIndex].label === selectedLabel) {
      selectedOption = monthOptions[optionIndex];
      break;
    }
  }

  if (!selectedOption) {
    var currentKey = String(now.getFullYear()) + '-' +
      String(now.getMonth() + 1).padStart(2, '0');
    for (var currentIndex = 0; currentIndex < monthOptions.length; currentIndex++) {
      if (monthOptions[currentIndex].key === currentKey) {
        selectedOption = monthOptions[currentIndex];
        break;
      }
    }
  }

  if (!selectedOption) selectedOption = monthOptions[0];

  var monthlyDashboard = computeTestMonthlySummaryFromRows_(
    rows,
    liveStartAt,
    selectedOption.key,
    now
  );

  sheet.getRange('J2:R5').getMergedRanges().forEach(function(mergedRange) {
    mergedRange.breakApart();
  });
  sheet.getRange('J2:R2').merge();
  var monthLabels = monthOptions.map(function(option) {
    return option.label;
  });
  var monthRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(monthLabels, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('J2')
    .setDataValidation(monthRule)
    .setValue(selectedOption.label)
    .setHorizontalAlignment('center');
  sheet.getRange(3, 10, 1, 9).setValues([[
    'Total Money', 'Loan Remaining', 'Total Earned', 'This Week Earned',
    'Money on Card', 'Money on Hand', 'Money on GCash', 'Utang kay Nanay', 'Others Loan'
  ]]);
  sheet.getRange(4, 10, 1, 9).setValues([[
    Number(monthlyDashboard.totalMoney || 0),
    Number(monthlyDashboard.loanRemaining || 0),
    Number(monthlyDashboard.totalEarned || 0),
    Number(monthlyDashboard.thisWeekEarned || 0),
    Number(monthlyDashboard.card || 0),
    Number(monthlyDashboard.cashOnHand || 0),
    Number(monthlyDashboard.gcash || 0),
    Number(monthlyDashboard.utangKayNanay || 0),
    Number(monthlyDashboard.othersLoan || 0)
  ]]);
  sheet.getRange(4, 10, 1, 9).setNumberFormat(getTestCurrencyNumberFormat_());
  sheet.getRange('J5:R5').clearContent();
}


function refreshTestYearlyDashboard_(sheet, rows, liveStartAt, asOfDate) {
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var years = getTestYearOptions_(rows, liveStartAt, now.getFullYear());
  var selectedYear = Number(sheet.getRange('T2').getValue());

  if (years.indexOf(selectedYear) === -1) {
    selectedYear = years.indexOf(now.getFullYear()) !== -1
      ? now.getFullYear()
      : years[0];
  }

  var summary = computeTestYearlySummaryFromRows_(
    rows,
    liveStartAt,
    selectedYear,
    now
  );

  sheet.getRange('T2:W5').getMergedRanges().forEach(function(mergedRange) {
    mergedRange.breakApart();
  });
  sheet.getRange('T2:W5').clearContent().clearDataValidations();

  sheet.getRange('T2:W2').merge();
  sheet.getRange('T3:U3').merge();
  sheet.getRange('V3:W3').merge();
  sheet.getRange('T4:U4').merge();
  sheet.getRange('V4:W4').merge();

  var yearStrings = years.map(function(year) {
    return String(year);
  });
  var yearRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(yearStrings, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange('T2')
    .setDataValidation(yearRule)
    .setValue(String(selectedYear))
    .setHorizontalAlignment('center');

  sheet.getRange('T3').setValue('Total Money');
  sheet.getRange('V3').setValue('Total Income');
  sheet.getRange('T4').setValue(Number(summary.totalMoney || 0));
  sheet.getRange('V4').setValue(Number(summary.totalIncome || 0));

  sheet.getRange('T3:W4')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.getRange('T4:W4').setNumberFormat(getTestCurrencyNumberFormat_());
  sheet.getRange('T2:W4').setBorder(
    true, true, true, true, true, true,
    '#555555',
    SpreadsheetApp.BorderStyle.SOLID
  );
}


// =========================================================
// TWICEASNYCE ENTRY PARSER
// =========================================================

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


function addTwiceAsNyceEntry(text, category) {

  var entry =
    parseTwiceAsNyceEntry_(
      text,
      category
    );

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

  var now = new Date();

  sheet
    .getRange("B5:F5")
    .insertCells(
      SpreadsheetApp.Dimension.ROWS
    );

  sheet
    .getRange(5, 2, 1, 5)
    .setValues([[
      now,
      now,
      entry.amount,
      entry.category,
      entry.description
    ]]);

  sheet
    .getRange(5, 2, 1, 5)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#555555",
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet
    .getRange("B5")
    .setNumberFormat("MM/dd/yy")
    .setHorizontalAlignment("center");

  sheet
    .getRange("C5")
    .setNumberFormat("hh:mm AM/PM")
    .setHorizontalAlignment("center");

  sheet
    .getRange("D5")
    .setNumberFormat("₱#,##0.00")
    .setHorizontalAlignment("left");

  alignIncomeExpenseCategoryRows_(sheet, 5, 1);

  SpreadsheetApp.flush();
  ensureTwiceAsNyceCurrentYearDropdown_(sheet);

  return {
    date: Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      "MM/dd/yy"
    ),
    time: Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      "hh:mm a"
    ),
    amount: entry.amount,
    category: entry.category,
    description: entry.description
  };
}




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
            isExpense: isExpense
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




// =========================================================
// TWICEASNYCE - SHEET DASHBOARD SETUP
// H:K = automatic current-month dashboard
// M:P = yearly dashboard with automatic year dropdown
// Uses INDIRECT so B5:F5 row inserts do not shift formulas.
// =========================================================

function setupTwiceAsNyceSheetDashboard() {

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

  sheet.getRange("H2:K2").breakApart();
  sheet.getRange("M2:P2").breakApart();

  sheet.getRange("H2:K2").merge();
  sheet.getRange("M2:P2").merge();

  // Reuse the already-approved Printing dashboard appearance.
  var printingSheet =
    spreadsheet.getSheetByName(
      "Printing Business"
    );

  if (printingSheet) {
    printingSheet
      .getRange("H2:K4")
      .copyTo(
        sheet.getRange("H2:K4"),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );

    printingSheet
      .getRange("M2:P4")
      .copyTo(
        sheet.getRange("M2:P4"),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
  }

  sheet
    .getRange("H2")
    .setFormula(
      '="MONTHLY — "&UPPER(TEXT(TODAY(),"MMMM YYYY"))'
    );

  sheet
    .getRange("H3:K3")
    .setValues([[
      "Income",
      "Expenses",
      "Profit",
      "Transactions"
    ]]);

  sheet
    .getRange("H4:K4")
    .setFormulas([[
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Income",INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1),0)',
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Expense",INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1),0)',
      '=H4-I4',
      '=COUNTIFS(INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1)'
    ]]);

  sheet
    .getRange("M3:P3")
    .setValues([[
      "Income",
      "Expenses",
      "Profit",
      "Transactions"
    ]]);

  sheet
    .getRange("M4:P4")
    .setFormulas([[
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Income",INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1)),0)',
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Expense",INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1)),0)',
      '=M4-N4',
      '=COUNTIFS(INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1))'
    ]]);

  sheet
    .getRange("H4:J4")
    .setNumberFormat("₱#,##0.00");

  sheet
    .getRange("M4:O4")
    .setNumberFormat("₱#,##0.00");

  sheet
    .getRange("K4")
    .setNumberFormat("0");

  sheet
    .getRange("P4")
    .setNumberFormat("0");

  sheet
    .getRange("H2:P4")
    .setHorizontalAlignment("center");

  sheet
    .getRange("H2:K3")
    .setFontWeight("bold");

  sheet
    .getRange("M2:P3")
    .setFontWeight("bold");

  refreshTwiceAsNyceYearDropdown();
  SpreadsheetApp.flush();

  return {
    success: true,
    message:
      "TwiceAsNyce monthly and yearly dashboards are ready."
  };
}


// =========================================================
// TWICEASNYCE - LIGHTWEIGHT YEAR DROPDOWN CHECK
// =========================================================

function ensureTwiceAsNyceCurrentYearDropdown_(sheet) {

  if (!sheet) return;

  var yearCell =
    sheet.getRange("M2");

  var currentYear =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy"
    );

  var rule =
    yearCell.getDataValidation();

  if (rule) {

    var criteriaType =
      rule.getCriteriaType();

    if (
      criteriaType ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
    ) {

      var criteriaValues =
        rule.getCriteriaValues();

      var allowedYears =
        (
          criteriaValues &&
          criteriaValues.length > 0 &&
          Array.isArray(criteriaValues[0])
        )
          ? criteriaValues[0].map(function(value) {
              return String(value);
            })
          : [];

      if (
        allowedYears.indexOf(
          currentYear
        ) !== -1
      ) {
        return;
      }
    }
  }

  refreshTwiceAsNyceYearDropdown();
}


// =========================================================
// TWICEASNYCE - AUTOMATIC YEAR DROPDOWN
// =========================================================

function refreshTwiceAsNyceYearDropdown() {

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

  var lastRow =
    sheet.getLastRow();

  var dates =
    lastRow >= 5
      ? sheet
          .getRange(
            5,
            2,
            lastRow - 4,
            1
          )
          .getValues()
          .flat()
      : [];

  var years = [];

  dates.forEach(function(value) {

    var dateValue =
      value instanceof Date
        ? value
        : new Date(value);

    if (
      !value ||
      isNaN(dateValue.getTime())
    ) {
      return;
    }

    var year =
      dateValue.getFullYear();

    if (
      years.indexOf(year) === -1
    ) {
      years.push(year);
    }
  });

  years.sort(function(a, b) {
    return b - a;
  });

  if (years.length === 0) {
    years.push(
      new Date().getFullYear()
    );
  }

  var yearCell =
    sheet.getRange("M2");

  var selectedYear =
    Number(
      yearCell.getValue()
    );

  var yearStrings =
    years.map(function(year) {
      return String(year);
    });

  var rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        yearStrings,
        true
      )
      .setAllowInvalid(false)
      .build();

  yearCell.setDataValidation(rule);

  if (
    years.indexOf(selectedYear) === -1
  ) {
    yearCell.setValue(
      years[0]
    );
  }

  yearCell
    .setHorizontalAlignment("center")
    .setFontWeight("bold");

  return years;
}


// =========================================================
// PRINTING BUSINESS ENTRY PARSER
// =========================================================

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



function addPrintingBusinessEntry(text, category) {

  var entry =
    parsePrintingEntry_(
      text,
      category
    );

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

  var now =
    new Date();

  sheet
    .getRange("B5:F5")
    .insertCells(
      SpreadsheetApp.Dimension.ROWS
    );

  sheet
    .getRange(5, 2, 1, 5)
    .setValues([[
      now,
      now,
      entry.amount,
      entry.category,
      entry.description
    ]]);

  var newRow =
    sheet.getRange(
      5,
      2,
      1,
      5
    );

  newRow.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    "#555555",
    SpreadsheetApp.BorderStyle.SOLID
  );

  sheet
    .getRange("B5")
    .setNumberFormat("MM/dd/yy")
    .setHorizontalAlignment("center");

  sheet
    .getRange("C5")
    .setNumberFormat("hh:mm AM/PM")
    .setHorizontalAlignment("center");

  sheet
    .getRange("D5")
    .setNumberFormat("₱#,##0.00")
    .setHorizontalAlignment("left");

  alignIncomeExpenseCategoryRows_(sheet, 5, 1);

  SpreadsheetApp.flush();
  ensurePrintingBusinessCurrentYearDropdown_(sheet);

  return {
    date:
      Utilities.formatDate(
        now,
        Session.getScriptTimeZone(),
        "MM/dd/yy"
      ),
    time:
      Utilities.formatDate(
        now,
        Session.getScriptTimeZone(),
        "hh:mm a"
      ),
    amount: entry.amount,
    category: entry.category,
    description: entry.description
  };
}



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
            isExpense: isExpense
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


// =========================================================
// PRINTING BUSINESS - SHEET DASHBOARD SETUP
// H:K = automatic current-month dashboard
// M:P = yearly dashboard with automatic year dropdown
// Uses INDIRECT so B5:F5 row inserts do not shift formulas.
// =========================================================

function setupPrintingBusinessSheetDashboard() {

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

  // Rebuild only the dashboard area. Transaction data B:F is untouched.
  sheet.getRange("H2:K2").breakApart();
  sheet.getRange("M2:P2").breakApart();

  sheet.getRange("H2:K2").merge();
  sheet.getRange("M2:P2").merge();

  // If the Cash In/Out dashboard exists, reuse its visual formatting.
  var cashSheet =
    spreadsheet.getSheetByName(
      "Cash In/Out"
    );

  if (cashSheet) {
    cashSheet
      .getRange("H2:K4")
      .copyTo(
        sheet.getRange("H2:K4"),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );

    cashSheet
      .getRange("M2:P4")
      .copyTo(
        sheet.getRange("M2:P4"),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
  }

  sheet
    .getRange("H2")
    .setFormula(
      '=\"MONTHLY — \"&UPPER(TEXT(TODAY(),\"MMMM YYYY\"))'
    );

  sheet
    .getRange("H3:K3")
    .setValues([[
      "Income",
      "Expenses",
      "Profit",
      "Transactions"
    ]]);

  sheet
    .getRange("H4:K4")
    .setFormulas([[
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Income",INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1),0)',
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Expense",INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1),0)',
      '=H4-I4',
      '=COUNTIFS(INDIRECT("$B$5:$B$20000"),">="&EOMONTH(TODAY(),-1)+1,INDIRECT("$B$5:$B$20000"),"<"&EOMONTH(TODAY(),0)+1)'
    ]]);

  sheet
    .getRange("M3:P3")
    .setValues([[
      "Income",
      "Expenses",
      "Profit",
      "Transactions"
    ]]);

  sheet
    .getRange("M4:P4")
    .setFormulas([[
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Income",INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1)),0)',
      '=IFERROR(SUMIFS(INDIRECT("$D$5:$D$20000"),INDIRECT("$E$5:$E$20000"),"Expense",INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1)),0)',
      '=M4-N4',
      '=COUNTIFS(INDIRECT("$B$5:$B$20000"),">="&DATE($M$2,1,1),INDIRECT("$B$5:$B$20000"),"<"&DATE($M$2+1,1,1))'
    ]]);

  sheet
    .getRange("H4:J4")
    .setNumberFormat("₱#,##0.00");

  sheet
    .getRange("M4:O4")
    .setNumberFormat("₱#,##0.00");

  sheet
    .getRange("K4")
    .setNumberFormat("0");

  sheet
    .getRange("P4")
    .setNumberFormat("0");

  sheet
    .getRange("H2:P4")
    .setHorizontalAlignment("center");

  sheet
    .getRange("H2:K3")
    .setFontWeight("bold");

  sheet
    .getRange("M2:P3")
    .setFontWeight("bold");

  refreshPrintingBusinessYearDropdown();
  SpreadsheetApp.flush();

  return {
    success: true,
    message:
      "Printing Business monthly and yearly dashboards are ready."
  };
}


// =========================================================
// PRINTING BUSINESS - LIGHTWEIGHT YEAR DROPDOWN CHECK
// Normal Printing saves call this instead of scanning full history.
// Full history is scanned only when the current year is missing.
// =========================================================

function ensurePrintingBusinessCurrentYearDropdown_(sheet) {

  if (!sheet) return;

  var yearCell =
    sheet.getRange("M2");

  var currentYear =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy"
    );

  var rule =
    yearCell.getDataValidation();

  if (rule) {

    var criteriaType =
      rule.getCriteriaType();

    if (
      criteriaType ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
    ) {

      var criteriaValues =
        rule.getCriteriaValues();

      var allowedYears =
        (
          criteriaValues &&
          criteriaValues.length > 0 &&
          Array.isArray(criteriaValues[0])
        )
          ? criteriaValues[0].map(function(value) {
              return String(value);
            })
          : [];

      if (
        allowedYears.indexOf(
          currentYear
        ) !== -1
      ) {
        return;
      }
    }
  }

  refreshPrintingBusinessYearDropdown();
}


// =========================================================
// PRINTING BUSINESS - AUTOMATIC YEAR DROPDOWN
// M2:P2 = merged year selector
// Years are taken automatically from Printing Business Column B.
// =========================================================

function refreshPrintingBusinessYearDropdown() {

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

  var lastRow =
    sheet.getLastRow();

  var dates = [];

  if (lastRow >= 5) {
    dates =
      sheet
        .getRange(
          5,
          2,
          lastRow - 4,
          1
        )
        .getValues()
        .flat();
  }

  var years = [];

  dates.forEach(function(value) {

    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {

      var year =
        value.getFullYear();

      if (
        years.indexOf(year) === -1
      ) {
        years.push(year);
      }
    }
  });

  years.sort(function(a, b) {
    return b - a;
  });

  if (years.length === 0) {
    years.push(
      new Date().getFullYear()
    );
  }

  var yearCell =
    sheet.getRange("M2");

  var selectedYear =
    Number(
      yearCell.getValue()
    );

  var yearStrings =
    years.map(function(year) {
      return String(year);
    });

  var rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        yearStrings,
        true
      )
      .setAllowInvalid(false)
      .build();

  yearCell.setDataValidation(rule);

  if (
    years.indexOf(selectedYear) === -1
  ) {
    yearCell.setValue(
      years[0]
    );
  }

  yearCell
    .setHorizontalAlignment("center")
    .setFontWeight("bold");

  return years;
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
        isExpense: isExpense
      };
    })
    .filter(function(item) { return !!item; })
    .sort(function(a, b) { return b.timestamp - a.timestamp; });
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
        isExpense: item.isExpense
      };
    }),
    nextCursor: nextCursor,
    hasMore: nextCursor < totalDataRows
  };
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


function getGcashBusinessTransactionsPageFromRows_(rows, category, cursor, limit) {
  var nextCursor = Math.max(0, Math.floor(Number(cursor) || 0));
  var safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)));
  var transactions = [];

  while (nextCursor < rows.length && transactions.length < safeLimit) {
    var matches = filterGcashBusinessTransactionsFromRows_([rows[nextCursor]], category);
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
        isExpense: item.isExpense
      };
    });

  return {
    category: String(category || "").trim().toLowerCase(),
    transactions: transactions,
    nextCursor: nextCursor,
    hasMore: nextCursor < totalDataRows
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
            isExpense: isExpense
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


// =========================================================
// GCASH DASHBOARD NUMBER CLEANER
// =========================================================

function normalizeGcashDashboardAmount_(value) {

  if (typeof value === "number") {
    return isNaN(value) ? 0 : value;
  }

  var cleaned =
    String(value || "")
      .replace(/[^0-9.-]/g, "");

  var amount =
    Number(cleaned);

  return isNaN(amount)
    ? 0
    : amount;
}

// =========================================================
// GCASH BUSINESS QUICK ENTRY
//
// B = Date
// C = Time
// D = Amount
// E = Category
// F = Description
//
// Category:
// Gcash / Maya / Bills / Load
//
// Quick buttons are INCOME only.
// Newest transaction always goes to Row 5.
// Only B:F moves — dashboards stay fixed.
// =========================================================

function addGcashBusinessQuickEntry(category, amount) {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
  spreadsheet.getSheetByName("Cash In/Out");


  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Cash In/Out".'
    );
  }


  // =======================================================
  // VALID CATEGORY
  // =======================================================

  var categoryMap = {
    gcash: "Gcash",
    maya: "Maya",
    bills: "Bills",
    load: "Load"
  };


  var categoryKey =
    String(category || "")
      .trim()
      .toLowerCase();


  if (!categoryMap[categoryKey]) {
    throw new Error(
      "Choose GCash, Maya, Bills, or Load first."
    );
  }


  var cleanCategory =
    categoryMap[categoryKey];


// =======================================================
// VALID AMOUNT
// =======================================================

amount = Number(amount);

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


  var now =
    new Date();


  // =======================================================
  // SHIFT ONLY B:F
  // Do NOT move H:K or M:P dashboards
  // =======================================================

  sheet
    .getRange("B5:F5")
    .insertCells(
      SpreadsheetApp.Dimension.ROWS
    );


  // =======================================================
  // WRITE NEW BUSINESS INCOME
  // =======================================================

  sheet
    .getRange(5, 2, 1, 5)
    .setValues([[
      now,             // B - Date
      now,             // C - Time
      amount,          // D - Amount
      cleanCategory,   // E - Category
      "Income"         // F - Description
    ]]);


  // =======================================================
  // FORMAT NEW ROW
  // =======================================================

  var newRow =
    sheet.getRange(
      5,
      2,
      1,
      5
    );


  newRow.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    "#555555",
    SpreadsheetApp.BorderStyle.SOLID
  );


  // Date
  sheet
    .getRange("B5")
    .setNumberFormat("MM/dd/yy")
    .setHorizontalAlignment("center");


  // Time
  sheet
    .getRange("C5")
    .setNumberFormat("hh:mm AM/PM")
    .setHorizontalAlignment("center");


  // Amount
  sheet
    .getRange("D5")
    .setNumberFormat("₱#,##0.00")
    .setHorizontalAlignment("left");


  SpreadsheetApp.flush();
ensureCashInOutCurrentYearDropdown_(sheet);

  // =======================================================
  // RETURN RESULT TO APP
  // =======================================================

  return {

    category:
      cleanCategory,

    amount:
      amount,

    type:
      "Income",

    date:
      Utilities.formatDate(
        now,
        Session.getScriptTimeZone(),
        "MM/dd/yy"
      ),

    time:
      Utilities.formatDate(
        now,
        Session.getScriptTimeZone(),
        "hh:mm a"
      )

  };
}

function addGcashBusinessTextEntry(text, categoryOverride) {

  var rawText =
    String(text || "").trim();


  if (!rawText) {
    throw new Error(
      "Enter a transaction."
    );
  }


  // =====================================================
  // AMOUNT
  // =====================================================

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


  // =====================================================
  // CATEGORY
  // =====================================================

  var lowerText =
    rawText.toLowerCase();

  var categoryMap = {
    gcash: "Gcash",
    maya: "Maya",
    bills: "Bills",
    load: "Load"
  };

  var overrideKey =
    String(categoryOverride || "")
      .trim()
      .toLowerCase();

  var category = "";


  // Category button override from the phone app.
  if (overrideKey) {

    if (!categoryMap[overrideKey]) {
      throw new Error(
        "Use GCash, Maya, Bills, or Load."
      );
    }

    category =
      categoryMap[overrideKey];

  }

  // Keep old text commands working:
  // "30 gcash", "50 maya expenses", etc.
  else if (/\bgcash\b/i.test(lowerText)) {
    category = "Gcash";
  }
  else if (/\bmaya\b/i.test(lowerText)) {
    category = "Maya";
  }
  else if (/\bbills?\b/i.test(lowerText)) {
    category = "Bills";
  }
  else if (/\bload\b/i.test(lowerText)) {
    category = "Load";
  }


  if (!category) {
    throw new Error(
      "Use GCash, Maya, Bills, or Load."
    );
  }


  // =====================================================
  // SAVE
  // B Date
  // C Time
  // D Amount
  // E Category
  // F Description
  // =====================================================

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName(
      "Cash In/Out"
    );


  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Cash In/Out".'
    );
  }


  var now =
    new Date();


  // Only B:F moves.
  // Dashboard starting at H stays fixed.
  sheet
    .getRange("B5:F5")
    .insertCells(
      SpreadsheetApp.Dimension.ROWS
    );


  sheet
    .getRange(5, 2, 1, 5)
    .setValues([[
      now,
      now,
      amount,
      category,
      rawText
    ]]);


  sheet
    .getRange("B5")
    .setNumberFormat("MM/dd/yy")
    .setHorizontalAlignment("center");


  sheet
    .getRange("C5")
    .setNumberFormat("hh:mm AM/PM")
    .setHorizontalAlignment("center");


  sheet
    .getRange("D5")
    .setNumberFormat("₱#,##0.00");


  sheet
    .getRange("B5:F5")
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#555555",
      SpreadsheetApp.BorderStyle.SOLID
    );


  SpreadsheetApp.flush();
  ensureCashInOutCurrentYearDropdown_(sheet);

  return {
    amount: amount,
    category: category,
    description: rawText
  };
}

// =========================================================
// CASH IN/OUT - LIGHTWEIGHT YEAR DROPDOWN CHECK
// Normal saves call this instead of scanning the full history.
// Only rebuild the dropdown if the current year is missing.
// =========================================================

function ensureCashInOutCurrentYearDropdown_(sheet) {

  if (!sheet) return;

  var yearCell =
    sheet.getRange("M2");

  var currentYear =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy"
    );

  var rule =
    yearCell.getDataValidation();

  if (rule) {

    var criteriaType =
      rule.getCriteriaType();

    if (
      criteriaType ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
    ) {

      var criteriaValues =
        rule.getCriteriaValues();

      var allowedYears =
        (
          criteriaValues &&
          criteriaValues.length > 0 &&
          Array.isArray(criteriaValues[0])
        )
          ? criteriaValues[0].map(function(value) {
              return String(value);
            })
          : [];

      if (
        allowedYears.indexOf(
          currentYear
        ) !== -1
      ) {
        return;
      }
    }
  }

  // Only fall back to the full history scan when needed.
  refreshCashInOutYearDropdown();
}


// =========================================================
// CASH IN/OUT - AUTOMATIC YEAR DROPDOWN
// M2:P2 = merged year selector
// Years are taken automatically from Column B
// =========================================================

function refreshCashInOutYearDropdown() {

  var spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    spreadsheet.getSheetByName("Cash In/Out");

  if (!sheet) {
    throw new Error(
      'Hindi makita ang sheet na "Cash In/Out".'
    );
  }


  var lastRow =
    sheet.getLastRow();

  var dates = [];


  if (lastRow >= 5) {

    dates =
      sheet
        .getRange(
          5,
          2,
          lastRow - 4,
          1
        )
        .getValues()
        .flat();
  }


  var years = [];


  dates.forEach(function(value) {

    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {

      var year =
        value.getFullYear();

      if (
        years.indexOf(year) === -1
      ) {
        years.push(year);
      }
    }

  });


  years.sort(function(a, b) {
    return b - a;
  });


  // If there is no data yet
  if (years.length === 0) {
    years.push(
      new Date().getFullYear()
    );
  }


  var yearCell =
    sheet.getRange("M2");


  var currentYear =
    Number(
      yearCell.getValue()
    );


  var yearStrings =
    years.map(function(year) {
      return String(year);
    });


  var rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        yearStrings,
        true
      )
      .setAllowInvalid(false)
      .build();


  yearCell.setDataValidation(rule);


  // Keep selected year if it still exists.
  // Otherwise choose newest year.
  if (
    years.indexOf(currentYear) === -1
  ) {
    yearCell.setValue(
      years[0]
    );
  }


  yearCell
    .setHorizontalAlignment("center")
    .setFontWeight("bold");
}

// =========================================================
// CASH IN/OUT - MONTHLY TOTAL INCOME
//
// Old imported data:
// E = Income / Expense
// F = Gcash / Maya / Bills / Load
//
// New data:
// E = Gcash / Maya / Bills / Load
// F = Description
//
// Expense / Expenses / Cash Out are NOT included.
// =========================================================

function getCashInOutMonthlyIncome_(
  sheet,
  timeZone,
  today
) {

  var lastRow =
    sheet.getLastRow();


  if (lastRow < 5) {
    return 0;
  }


  var rows =
    sheet
      .getRange(
        5,
        2,
        lastRow - 4,
        5
      )
      .getValues();


  var currentMonth =
    Utilities.formatDate(
      today,
      timeZone,
      "yyyy-MM"
    );


  var totalIncome = 0;


  rows.forEach(function(row) {

    var dateValue = row[0]; // B
    var amount =
      Math.abs(
        Number(row[2]) || 0
      );                    // D

    var columnE =
      String(row[3] || "")
        .trim()
        .toLowerCase();     // E

    var columnF =
      String(row[4] || "")
        .trim();            // F


    if (
      !dateValue ||
      amount <= 0
    ) {
      return;
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
      return;
    }


    var transactionMonth =
      Utilities.formatDate(
        transactionDate,
        timeZone,
        "yyyy-MM"
      );


    if (
      transactionMonth !==
      currentMonth
    ) {
      return;
    }


    // Old imported Expense row
    var isOldExpense =
      columnE === "expense";


    // New transaction description
    var isNewExpense =
      /(^|[^a-z])(expense|expenses|cash[ -]?out)([^a-z]|$)/i
        .test(columnF);


    if (
      !isOldExpense &&
      !isNewExpense
    ) {

      totalIncome += amount;

    }

  });


  return totalIncome;
}

function addTestAapCollection_(text, destination) {
  ensureTestCashOutSetup_();
  var parsed = parseTestAapInput_(text);
  var calculation = calculateTestAap_(parsed.people, parsed.bookTotal);
  var collectionDestination = normalizeTestAapDestination_(destination);
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

    var now = new Date();
    sheet.getRange('B5:H5').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 1, 7).setValues([
      buildTestAapRow_(now, calculation, collectionDestination)
    ]);
    formatTestLedgerRows_(sheet, 5, 1);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      customer: calculation.customer,
      destination: collectionDestination,
      people: calculation.people,
      bookTotal: calculation.bookTotal,
      totalFee: calculation.totalFee,
      systemFee: calculation.systemFee,
      feeEarned: 0,
      cashReceived: calculation.cashReceived,
      appDeduction: 0,
      amount: calculation.cashReceived,
      category: 'Collection',
      description: buildTestAapDescription_(calculation, collectionDestination)
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H5').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function addTestTransfer_(text, direction) {
  ensureTestCashOutSetup_();
  var parsedTransfer = parseTestTransferInput_(text);
  var transferAmount = parsedTransfer.amount;
  var transferDirection = normalizeTestTransferDirection_(direction);
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "test".');

    var lastRow = sheet.getLastRow();
    var rows = lastRow >= 5
      ? sheet.getRange(5, 2, lastRow - 4, 7).getValues()
      : [];
    var liveStartAt = PropertiesService.getDocumentProperties()
      .getProperty(TEST_LIVE_START_AT_KEY_);
    var balances = computeTestDashboardFromRows_(rows, liveStartAt);
    var processing = null;

    if (transferDirection === 'gcashToCard') {
      if (parsedTransfer.mode === 'aap') {
        processing = calculateTestAap_(parsedTransfer.people, parsedTransfer.bookTotal);
        if (Number(balances.gcash) < transferAmount) {
          throw new Error('Not enough GCash balance.');
        }
      }
    } else if (parsedTransfer.mode === 'aap') {
      throw new Error('AAP transfer is only available for GCash to Card.');
    }
    if (!processing) {
      applyTestTransferToBalances_(balances, transferAmount, transferDirection);
    }

    var now = new Date();
    var row = buildTestTransferInputRow_(now, parsedTransfer, transferDirection);
    sheet.getRange('B5:H5').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 1, 7).setValues([row]);
    formatTestLedgerRows_(sheet, 5, 1);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      customer: 'Transfer',
      amount: transferAmount,
      feeEarned: processing ? processing.feeEarned : '',
      category: 'Transfer',
      description: row[6],
      direction: transferDirection
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H5').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function addTestOthersLoan_(text, action) {
  ensureTestCashOutSetup_();
  var entry = parseTestOthersLoanInput_(text, action);
  var lock = LockService.getDocumentLock();
  var locked = false;
  var inserted = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var balances = getTestLiveBalances_();
    applyTestOthersLoanToBalances_(balances, entry);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
    if (!sheet) throw new Error('Hindi makita ang sheet na "Konek2Card".');

    var now = new Date();
    var row = buildTestOthersLoanRow_(now, entry);
    sheet.getRange('B5:H5').insertCells(SpreadsheetApp.Dimension.ROWS);
    inserted = true;
    sheet.getRange(5, 2, 1, 7).setValues([row]);
    formatTestLedgerRows_(sheet, 5, 1);
    SpreadsheetApp.flush();

    return {
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yy'),
      time: Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a'),
      action: entry.action,
      principal: entry.principal,
      fee: entry.fee,
      netToCard: entry.netToCard,
      lender: entry.lender,
      amount: entry.principal,
      category: 'Transfer',
      description: row[6]
    };
  } catch (error) {
    if (inserted) {
      try {
        var rollbackSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEST_SHEET_NAME_);
        rollbackSheet.getRange('B5:H5').deleteCells(SpreadsheetApp.Dimension.ROWS);
        SpreadsheetApp.flush();
      } catch (rollbackError) {
      }
    }
    throw error;
  } finally {
    if (locked) lock.releaseLock();
  }
}
