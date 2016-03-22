/*global I18n:true */

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement, fromIndex) {
    if ( this === undefined || this === null ) {
      throw new TypeError( '"this" is null or not defined' );
    }

    var length = this.length >>> 0; // Hack to convert object.length to a UInt32

    fromIndex = +fromIndex || 0;

    if (Math.abs(fromIndex) === Infinity) {
      fromIndex = 0;
    }

    if (fromIndex < 0) {
      fromIndex += length;
      if (fromIndex < 0) {
        fromIndex = 0;
      }
    }

    for (;fromIndex < length; fromIndex++) {
      if (this[fromIndex] === searchElement) {
        return fromIndex;
      }
    }

    return -1;
  };
}

// Instantiate the object
var I18n = I18n || {};

// Set default locale to english
I18n.defaultLocale = "en";

// Set default handling of translation fallbacks to false
I18n.fallbacks = false;

// Set default separator
I18n.defaultSeparator = ".";

// Set current locale to null
I18n.locale = null;

// Set the placeholder format. Accepts `{{placeholder}}` and `%{placeholder}`.
I18n.PLACEHOLDER = /(?:\{\{|%\{)(.*?)(?:\}\}?)/gm;

I18n.fallbackRules = {};

I18n.noFallbacks = false;

I18n.pluralizationRules = {
  en: function(n) {
    return n === 0 ? ["zero", "none", "other"] : n === 1 ? "one" : "other";
  },
  "zh_CN": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "zh_TW": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "ko": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  }
};

I18n.getFallbacks = function(locale) {
  if (locale === I18n.defaultLocale) {
    return [];
  } else if (!I18n.fallbackRules[locale]) {
    var rules = [],
        components = locale.split("-");

    for (var l = 1; l < components.length; l++) {
      rules.push(components.slice(0, l).join("-"));
    }

    rules.push(I18n.defaultLocale);

    I18n.fallbackRules[locale] = rules;
  }

  return I18n.fallbackRules[locale];
};

I18n.isValidNode = function(obj, node, undefined) {
  return obj[node] !== null && obj[node] !== undefined;
};

I18n.lookup = function(scope, options) {
  options = options || {};
  var lookupInitialScope = scope,
      translations = this.prepareOptions(I18n.translations),
      locale = options.locale || I18n.currentLocale(),
      messages = translations[locale] || {},
      currentScope;

  options = this.prepareOptions(options);

  if (typeof scope === "object") {
    scope = scope.join(this.defaultSeparator);
  }

  if (options.scope) {
    scope = options.scope.toString() + this.defaultSeparator + scope;
  }

  scope = scope.split(this.defaultSeparator);

  while (messages && scope.length > 0) {
    currentScope = scope.shift();
    messages = messages[currentScope];
  }

  if (!messages) {
    if (I18n.fallbacks) {
      var fallbacks = this.getFallbacks(locale);
      for (var fallback = 0; fallback < fallbacks.length; fallbacks++) {
        messages = I18n.lookup(lookupInitialScope, this.prepareOptions({locale: fallbacks[fallback]}, options));
        if (messages) {
          break;
        }
      }
    }

    if (!messages && this.isValidNode(options, "defaultValue")) {
        messages = options.defaultValue;
    }
  }

  return messages;
};

// Merge serveral hash options, checking if value is set before
// overwriting any value. The precedence is from left to right.
//
//   I18n.prepareOptions({name: "John Doe"}, {name: "Mary Doe", role: "user"});
//   #=> {name: "John Doe", role: "user"}
//
I18n.prepareOptions = function() {
  var options = {},
      opts,
      count = arguments.length;

  for (var i = 0; i < count; i++) {
    opts = arguments[i];

    if (!opts) {
      continue;
    }

    for (var key in opts) {
      if (!this.isValidNode(options, key)) {
        options[key] = opts[key];
      }
    }
  }

  return options;
};

I18n.interpolate = function(message, options) {
  options = this.prepareOptions(options);
  var matches = message.match(this.PLACEHOLDER),
      placeholder,
      value,
      name;

  if (!matches) {
    return message;
  }

  for (var i = 0; placeholder = matches[i]; i++) {
    name = placeholder.replace(this.PLACEHOLDER, "$1");

    value = options[name];

    if (!this.isValidNode(options, name)) {
      value = "[missing " + placeholder + " value]";
    }

    var regex = new RegExp(placeholder.replace(/\{/gm, "\\{").replace(/\}/gm, "\\}"));
    message = message.replace(regex, value);
  }

  return message;
};

I18n.translate = function(scope, options) {
  options = this.prepareOptions(options);
  var translation = this.lookup(scope, options);
  // Fallback to the default locale
  if (!translation && this.currentLocale() !== this.defaultLocale && !this.noFallbacks) {
    options.locale = this.defaultLocale;
    translation = this.lookup(scope, options);
  }
  if (!translation && this.currentLocale() !== 'en' && !this.noFallbacks) {
    options.locale = 'en';
    translation = this.lookup(scope, options);
  }

  try {
    if (typeof translation === "object") {
      if (typeof options.count === "number") {
        return this.pluralize(options.count, scope, options);
      } else {
        return translation;
      }
    } else {
      return this.interpolate(translation, options);
    }
  } catch (error) {
    return this.missingTranslation(scope);
  }
};

I18n.localize = function(scope, value) {
  switch (scope) {
    case "currency":
      return this.toCurrency(value);
    case "number":
      scope = this.lookup("number.format");
      return this.toNumber(value, scope);
    case "percentage":
      return this.toPercentage(value);
    default:
      if (scope.match(/^(date|time)/)) {
        return this.toTime(scope, value);
      } else {
        return value.toString();
      }
  }
};

I18n.parseDate = function(date) {
  var matches, convertedDate;

  // we have a date, so just return it.
  if (typeof date === "object") {
    return date;
  }

  // it matches the following formats:
  //   yyyy-mm-dd
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ssZ
  //   yyyy-mm-dd[ T]hh:mm::ss+0000
  //
  matches = date.toString().match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|\+0000)?/);

  if (matches) {
    for (var i = 1; i <= 6; i++) {
      matches[i] = parseInt(matches[i], 10) || 0;
    }

    // month starts on 0
    matches[2] -= 1;

    if (matches[7]) {
      convertedDate = new Date(Date.UTC(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]));
    } else {
      convertedDate = new Date(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]);
    }
  } else if (typeof date === "number") {
    // UNIX timestamp
    convertedDate = new Date();
    convertedDate.setTime(date);
  } else if (date.match(/\d+ \d+:\d+:\d+ [+-]\d+ \d+/)) {
    // a valid javascript format with timezone info
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  } else {
    // an arbitrary javascript string
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  }

  return convertedDate;
};

I18n.toTime = function(scope, d) {
  var date = this.parseDate(d),
      format = this.lookup(scope);

  if (date.toString().match(/invalid/i)) {
    return date.toString();
  }

  if (!format) {
    return date.toString();
  }

  return this.strftime(date, format);
};

I18n.strftime = function(date, format) {
  var options = this.lookup("date");

  if (!options) {
    return date.toString();
  }

  options.meridian = options.meridian || ["AM", "PM"];

  var weekDay = date.getDay(),
      day = date.getDate(),
      year = date.getFullYear(),
      month = date.getMonth() + 1,
      hour = date.getHours(),
      hour12 = hour,
      meridian = hour > 11 ? 1 : 0,
      secs = date.getSeconds(),
      mins = date.getMinutes(),
      offset = date.getTimezoneOffset(),
      absOffsetHours = Math.floor(Math.abs(offset / 60)),
      absOffsetMinutes = Math.abs(offset) - (absOffsetHours * 60),
      timezoneoffset = (offset > 0 ? "-" : "+") + (absOffsetHours.toString().length < 2 ? "0" + absOffsetHours : absOffsetHours) + (absOffsetMinutes.toString().length < 2 ? "0" + absOffsetMinutes : absOffsetMinutes);

  if (hour12 > 12) {
    hour12 = hour12 - 12;
  } else if (hour12 === 0) {
    hour12 = 12;
  }

  var padding = function(n) {
    var s = "0" + n.toString();
    return s.substr(s.length - 2);
  };

  var f = format;
  f = f.replace("%a", options.abbr_day_names[weekDay]);
  f = f.replace("%A", options.day_names[weekDay]);
  f = f.replace("%b", options.abbr_month_names[month]);
  f = f.replace("%B", options.month_names[month]);
  f = f.replace("%d", padding(day));
  f = f.replace("%e", day);
  f = f.replace("%-d", day);
  f = f.replace("%H", padding(hour));
  f = f.replace("%-H", hour);
  f = f.replace("%I", padding(hour12));
  f = f.replace("%-I", hour12);
  f = f.replace("%m", padding(month));
  f = f.replace("%-m", month);
  f = f.replace("%M", padding(mins));
  f = f.replace("%-M", mins);
  f = f.replace("%p", options.meridian[meridian]);
  f = f.replace("%S", padding(secs));
  f = f.replace("%-S", secs);
  f = f.replace("%w", weekDay);
  f = f.replace("%y", padding(year));
  f = f.replace("%-y", padding(year).replace(/^0+/, ""));
  f = f.replace("%Y", year);
  f = f.replace("%z", timezoneoffset);

  return f;
};

I18n.toNumber = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ",", strip_insignificant_zeros: false}
  );

  var negative = number < 0,
      string = Math.abs(number).toFixed(options.precision).toString(),
      parts = string.split("."),
      precision,
      buffer = [],
      formattedNumber;

  number = parts[0];
  precision = parts[1];

  while (number.length > 0) {
    buffer.unshift(number.substr(Math.max(0, number.length - 3), 3));
    number = number.substr(0, number.length -3);
  }

  formattedNumber = buffer.join(options.delimiter);

  if (options.precision > 0) {
    formattedNumber += options.separator + parts[1];
  }

  if (negative) {
    formattedNumber = "-" + formattedNumber;
  }

  if (options.strip_insignificant_zeros) {
    var regex = {
        separator: new RegExp(options.separator.replace(/\./, "\\.") + "$"),
        zeros: /0+$/
    };

    formattedNumber = formattedNumber
      .replace(regex.zeros, "")
      .replace(regex.separator, "")
    ;
  }

  return formattedNumber;
};

I18n.toCurrency = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.currency.format"),
    this.lookup("number.format"),
    {unit: "$", precision: 2, format: "%u%n", delimiter: ",", separator: "."}
  );

  number = this.toNumber(number, options);
  number = options.format
    .replace("%u", options.unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toHumanSize = function(number, options) {
  var kb = 1024,
      size = number,
      iterations = 0,
      unit,
      precision;

  while (size >= kb && iterations < 4) {
    size = size / kb;
    iterations += 1;
  }

  if (iterations === 0) {
    unit = this.t("number.human.storage_units.units.byte", {count: size});
    precision = 0;
  } else {
    unit = this.t("number.human.storage_units.units." + [null, "kb", "mb", "gb", "tb"][iterations]);
    precision = (size - Math.floor(size) === 0) ? 0 : 1;
  }

  options = this.prepareOptions(
    options,
    {precision: precision, format: "%n%u", delimiter: ""}
  );

  number = this.toNumber(size, options);
  number = options.format
    .replace("%u", unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toPercentage = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.percentage.format"),
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ""}
  );

  number = this.toNumber(number, options);
  return number + "%";
};

I18n.pluralizer = function(locale) {
  var pluralizer = this.pluralizationRules[locale];
  if (pluralizer !== undefined) return pluralizer;
  return this.pluralizationRules["en"];
};

I18n.findAndTranslateValidNode = function(keys, translation) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (this.isValidNode(translation, key)) return translation[key];
  }
  return null;
};

I18n.pluralize = function(count, scope, options) {
  var translation;

  try { translation = this.lookup(scope, options); } catch (error) {}
  if (!translation) { return this.missingTranslation(scope); }

  options = this.prepareOptions(options);
  options.count = count.toString();

  var pluralizer = this.pluralizer(this.currentLocale());
  var key = pluralizer(Math.abs(count));
  var keys = ((typeof key === "object") && (key instanceof Array)) ? key : [key];

  var message = this.findAndTranslateValidNode(keys, translation);
  if (message == null) message = this.missingTranslation(scope, keys[0]);

  return this.interpolate(message, options);
};

I18n.missingTranslation = function(scope, key) {
  var message = '[' + this.currentLocale() + "." + scope;
  if (key) { message += "." + key; }
  return message + ']';
};

I18n.currentLocale = function() {
  return (I18n.locale || I18n.defaultLocale);
};

// shortcuts
I18n.t = I18n.translate;
I18n.l = I18n.localize;
I18n.p = I18n.pluralize;

I18n.enable_verbose_localization = function(){
  var counter = 0;
  var keys = {};
  var t = I18n.t;

  I18n.noFallbacks = true;

  I18n.t = I18n.translate = function(scope, value){
    var current = keys[scope];
    if(!current) {
      current = keys[scope] = ++counter;
      var message = "Translation #" + current + ": " + scope;
      if (!_.isEmpty(value)) {
        message += ", parameters: " + JSON.stringify(value);
      }
      Em.Logger.info(message);
    }
    return t.apply(I18n, [scope, value]) + " (t" + current + ")";
  };
};


I18n.verbose_localization_session = function(){
  sessionStorage.setItem("verbose_localization", "true");
  I18n.enable_verbose_localization();
  return true;
}

try {
  if(sessionStorage && sessionStorage.getItem("verbose_localization")) {
    I18n.enable_verbose_localization();
  }
} catch(e){
  // we don't care really, can happen if cookies disabled
}
;


MessageFormat = {locale: {}};
MessageFormat.locale.ja = function ( n ) {
  return "other";
};

I18n.messageFormat = (function(formats){
      var f = formats;
      return function(key, options) {
        var fn = f[key];
        if(fn){
          try {
            return fn(options);
          } catch(err) {
            return err.message;
          }
        } else {
          return 'Missing Key: ' + key
        }
        return f[key](options);
      };
    })({"topic.read_more_MF" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "UNREAD";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"0" : function(d){
var r = "";
return r;
},
"one" : function(d){
var r = "";
r += "<a href='/unread'>未読 1つ</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "<a href='/unread'>未読 " + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + "つ</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ja"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "NEW";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"0" : function(d){
var r = "";
return r;
},
"one" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_2 = "BOTH";
var k_2=d[lastkey_2];
var off_1 = 0;
var pf_1 = { 
"true" : function(d){
var r = "";
return r;
},
"false" : function(d){
var r = "";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>新規トピック 1つ</a>";
return r;
},
"other" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_2 = "BOTH";
var k_2=d[lastkey_2];
var off_1 = 0;
var pf_1 = { 
"true" : function(d){
var r = "";
return r;
},
"false" : function(d){
var r = "";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>新規トピック " + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + "つ</a>";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ja"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " remaining, or ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
r += d["catLink"];
r += "の他のトピックを読む";
return r;
},
"false" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
r += d["latestLink"];
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_0[ k_1 ] || pf_0[ "other" ])( d );
return r;
} , "posts_likes_MF" : function(d){
var r = "";
r += "This topic has ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 reply";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " replies";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ja"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "ratio";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"low" : function(d){
var r = "";
r += "with a high like to post ratio";
return r;
},
"med" : function(d){
var r = "";
r += "with a very high like to post ratio";
return r;
},
"high" : function(d){
var r = "";
r += "with an extremely high like to post ratio";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_0[ k_1 ] || pf_0[ "other" ])( d );
r += "\n";
return r;
}});I18n.translations = {"ja":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"other":"バイト"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1分","less_than_x_seconds":{"other":"\u003c %{count} 秒"},"x_seconds":{"other":"%{count} 秒"},"less_than_x_minutes":{"other":"\u003c %{count} 分"},"x_minutes":{"other":"%{count} 分"},"about_x_hours":{"other":"%{count} 時間"},"x_days":{"other":"%{count} 日"},"about_x_years":{"other":"%{count} 年"},"over_x_years":{"other":"\u003e %{count} 年"},"almost_x_years":{"other":"%{count} 年"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"other":"%{count} 分"},"x_hours":{"other":"%{count} 時間"},"x_days":{"other":"%{count} 日"},"date_year":"YYYY年MM月D日"},"medium_with_ago":{"x_minutes":{"other":"%{count} 分前"},"x_hours":{"other":"%{count} 時間前"},"x_days":{"other":"%{count} 日前"}},"later":{"x_days":{"other":"%{count} 日後"},"x_months":{"other":"%{count} 月後"},"x_years":{"other":"%{count} 年後"}}},"share":{"topic":"このトピックのリンクをシェアする","post":"ポスト #%{postNumber}","close":"閉じる","twitter":"Twitter でこのリンクを共有する","facebook":"Facebook でこのリンクを共有する","google+":"Google+ でこのリンクを共有する","email":"メールでこのリンクを送る"},"topic_admin_menu":"トピック管理","emails_are_disabled":"全てのメールアドレスの送信が管理者によって無効化されています。全ての種類のメール通知は行われません","edit":"このトピックのタイトルとカテゴリを編集","not_implemented":"申し訳ありませんが、この機能はまだ実装されていません","no_value":"いいえ","yes_value":"はい","generic_error":"申し訳ありませんが、エラーが発生しました","generic_error_with_reason":"エラーが発生しました: %{error}","sign_up":"サインアップ","log_in":"ログイン","age":"経過","joined":"参加時刻","admin_title":"管理者","flags_title":"フラグ","show_more":"もっと見る","links":"リンク","links_lowercase":{"other":"リンク集"},"faq":"よくある質問","guidelines":"ガイドライン","privacy_policy":"プライバシーポリシー","privacy":"プライバシー","terms_of_service":"利用規約","mobile_view":"モバイル表示","desktop_view":"デスクトップ表示","you":"あなた","or":"あるいは","now":"たった今","read_more":"もっと読む","more":"More","less":"Less","never":"never","daily":"毎日","weekly":"毎週","every_two_weeks":"隔週","every_three_days":"３日毎","max_of_count":"最大 {{count}}","alternation":"または","character_count":{"other":"{{count}} 文字"},"suggested_topics":{"title":"関連トピック"},"about":{"simple_title":"このサイトについて","title":"%{title}について","stats":" サイト統計","our_admins":"管理者","our_moderators":"モデレータ","stat":{"all_time":"今まで","last_7_days":"過去7日間","last_30_days":"過去30日間"},"like_count":"いいね！","topic_count":"トピック","post_count":"ポスト","user_count":"新規ユーザ","active_user_count":"アクティブユーザ","contact":"問い合わせ","contact_info":"このサイトに影響を与える重要な問題や緊急の問題が発生した場合は、 %{contact_info}までご連絡ください"},"bookmarked":{"title":"ブックマーク","clear_bookmarks":"ブックマークをクリア","help":{"bookmark":"クリックするとトピックの最初のポストをブックマークします","unbookmark":"クリックするとトピック内の全てのブックマークを削除します"}},"bookmarks":{"not_logged_in":"ポストをブックマークするには、ログインする必要があります","created":"このポストをブックマークしました","not_bookmarked":"このポストをブックマークする","last_read":"このポストをブックマークする","remove":"ブックマークを削除","confirm_clear":"このトピックの全てのブックマークを削除してもよいですか？"},"topic_count_latest":{"other":"{{count}} 個の新規または更新されたトピック。"},"topic_count_unread":{"other":"{{count}} 個の未読トピック。"},"topic_count_new":{"other":"{{count}} 個の新規トピック。"},"click_to_show":"クリックして表示","preview":"プレビュー","cancel":"キャンセル","save":"変更を保存","saving":"保存中...","saved":"保存しました","upload":"アップロード","uploading":"アップロード中...","uploaded":"アップロードしました","enable":"有効にする","disable":"無効にする","undo":"取り消す","revert":"戻す","failed":"失敗","switch_to_anon":"匿名モード","banner":{"close":"バナーを閉じる。","edit":"このバナーを編集 \u003e\u003e"},"choose_topic":{"none_found":"トピックが見つかりませんでした。","title":{"search":"トピック名、URL、または ID でトピックを検索:","placeholder":"ここにトピックのタイトルを入力"}},"queue":{"topic":"トピック：","approve":"承認","reject":"リジェクト","delete_user":"削除されたユーザ","title":"承認待ち","none":"レビュー待ちの投稿はありません。","edit":"編集","cancel":"キャンセル","view_pending":"保留とされている投稿を閲覧する","has_pending_posts":{"other":"このトピックは\u003cb\u003e{{count}}\u003c/b\u003e個の投稿が承認待ちです"},"confirm":"変更を保存","delete_prompt":"\u003cb\u003e%{username}\u003c/b\u003eを本当に削除しますか？全ての投稿が削除されるのと同時にメールアドレスとIPアドレスがブロックされます。","approval":{"title":"この投稿は承認が必要","description":"投稿された新規のポストは受付されましたがモデレータによる承認が必要です。もう少々お待ち下さい。","pending_posts":{"other":"\u003cstrong\u003e{{count}}\u003c/strong\u003e個のポストが保留中です。"},"ok":"実行"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e が \u003ca href='{{topicUrl}}'\u003eトピック\u003c/a\u003e を作成","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eあなた\u003c/a\u003e が \u003ca href='{{topicUrl}}'\u003eトピック\u003c/a\u003e を作成","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e が \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e に回答","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eあなた\u003c/a\u003e が \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e に回答","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e が \u003ca href='{{topicUrl}}'\u003eトピック\u003c/a\u003e に回答","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eあなた\u003c/a\u003e が \u003ca href='{{topicUrl}}'\u003eトピック\u003c/a\u003e に回答","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e が \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e をタグ付けしました","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e が \u003ca href='{{user2Url}}'\u003eあなた\u003c/a\u003e を をタグ付けしました","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eあなた\u003c/a\u003e が \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e をタグ付けしました","posted_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e がポストを投稿","posted_by_you":"\u003ca href='{{userUrl}}'\u003eあなた\u003c/a\u003e がポストを投稿","sent_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e が送信","sent_by_you":"\u003ca href='{{userUrl}}'\u003eあなた\u003c/a\u003e が送信"},"directory":{"filter_name":"ユーザ名でフィルタ","title":"ユーザ","likes_given":"与えた","likes_received":"もらった","topics_entered":"入力された","topics_entered_long":"入力されたトピック数","time_read":"読んだ時間","topic_count":"トピック","topic_count_long":"作成されたトピック数","post_count":"返信","post_count_long":"投稿された回答数","no_results":"結果はありませんでした","days_visited":"訪問数","days_visited_long":"訪問された日数","posts_read":"閲覧済み","posts_read_long":"閲覧された投稿数","total_rows":{"other":"%{count} 人のユーザ"}},"groups":{"visible":"このグループは全てのユーザに表示されています。","title":{"other":"グループ"},"members":"メンバー","posts":"ポスト","alias_levels":{"title":"このグループを仮名として使えるユーザ","nobody":"無し","only_admins":"管理者のみ","mods_and_admins":"管理者とモデレータのみ","members_mods_and_admins":"管理者、モデレータとグループメンバーのみ","everyone":"だれでも"}},"user_action_groups":{"1":"「いいね！」 ","2":"「いいね！」 された","3":"ブックマーク","4":"トピック","5":"回答数","6":"レスポンス数","7":"タグ付け","9":"引用","10":"お気に入り","11":"編集","12":"アイテム送信","13":"インボックス","14":"保留"},"categories":{"all":"全てのカテゴリ","all_subcategories":"全てのサブカテゴリ","no_subcategory":"サブカテゴリなし","category":"カテゴリ","posts":"ポスト","topics":"トピック","latest":"最新ポスト","latest_by":"最新投稿： ","toggle_ordering":"カテゴリ並び替えモードをトグル","subcategories":"サブカテゴリ:","topic_stats":"新しいトピック数","topic_stat_sentence":{"other":"過去 %{unit} 間 %{count} 個の新規トピック。"},"post_stats":"新規トピック数：","post_stat_sentence":{"other":"過去 %{unit} 間 %{count} 個の新しい投稿。"}},"ip_lookup":{"title":"IPアドレス検索","hostname":"ホスト名","location":"所在地","location_not_found":"（不明）","organisation":"組織","phone":"電話","other_accounts":"同じIPアドレスを持つアカウント","delete_other_accounts":"%{count} 件削除","username":"ユーザ名","trust_level":"トラストレベル","read_time":"読んだ時間","topics_entered":"Topics Entered","post_count":"# ポスト","confirm_delete_other_accounts":"これらのアカウントを削除してよいですか？"},"user_fields":{"none":"(オプションを選択)"},"user":{"said":"{{username}}:","profile":"プロフィール","mute":"ミュート","edit":"プロフィールを編集","download_archive":"自分の投稿をダウンロード","new_private_message":"新規メッセージ","private_message":"メッセージ","private_messages":"メッセージ","activity_stream":"アクティビティ","preferences":"設定","bookmarks":"ブックマーク","bio":"自己紹介","invited_by":"招待者","trust_level":"トラストレベル","notifications":"通知","desktop_notifications":{"label":"デスクトップ通知","not_supported":"申し訳ありません。そのブラウザは通知をサポートしていません。","perm_default":"通知をONにする","perm_denied_btn":"アクセス拒否","perm_denied_expl":"通知へのアクセスを拒否されています。利用しているブラウザの通知を有効にし、完了したら、このボタンをクリックしてください。(デスクトップ: アドレスバーの左端のアイコン。 モバイル: \"サイト情報\")","disable":"通知を無効にする","currently_enabled":"(現在有効化されています)","enable":"通知を有効化","currently_disabled":"(現在無効化されています)","each_browser_note":"注意: 利用するブラウザ全てでこの設定を変更する必要があります"},"dismiss_notifications":"全て既読にする","dismiss_notifications_tooltip":"全ての未読の通知を既読にします","disable_jump_reply":"返信したあとに投稿に移動しない","dynamic_favicon":"新規または更新されたトピックのカウントをブラウザアイコンに表示する","edit_history_public":"投稿編集履歴を公開する","external_links_in_new_tab":"外部リンクを全て新しいタブで開く","enable_quoting":"ハイライトしたテキストを引用して回答する","change":"変更","moderator":"{{user}} はモデレータです","admin":"{{user}} は管理者です","moderator_tooltip":"このユーザはモデレータであり","admin_tooltip":"このユーザは管理者であり","blocked_tooltip":"このユーザーはブロックされています","suspended_notice":"このユーザは {{date}} までサスペンド状態です。","suspended_reason":"理由: ","github_profile":"Github","mailing_list_mode":"投稿される度にメールで通知を受け取る(ミュートにしたトピック、カテゴリー以外)","watched_categories":"参加中","watched_categories_instructions":"これらのカテゴリに新しく投稿されたトピックを自動的に参加します。これらのカテゴリに対して新しい投稿があった場合、登録されたメールアドレスと、コミュニティ内の通知ボックスに通知が届き、トピック一覧に新しい投稿数がつきます。","tracked_categories":"トラック中","tracked_categories_instructions":"これらのカテゴリの新規トピックを自動的にトラックします。トピックに対して新しい投稿があった場合、トピック一覧に新しい投稿数がつきます。","muted_categories":"ミュート中","delete_account":"アカウントを削除する","delete_account_confirm":"本当にアカウントを削除しますか？削除されたアカウントを復元できません。","deleted_yourself":"あなたのアカウントは削除されました。","delete_yourself_not_allowed":"アカウントを削除できませんでした。サイト管理者を連絡してください。","unread_message_count":"メッセージ","admin_delete":"削除","users":"ユーザ","muted_users":"ミュート","muted_users_instructions":"これらのユーザからの全ての通知を抑制します。","staff_counters":{"flags_given":"役に立ったフラグ","flagged_posts":"フラグを立てたポスト","deleted_posts":"削除したポスト","suspensions":"停止中","warnings_received":"注意"},"messages":{"all":"すべて","mine":"受信トレイ","unread":"未読"},"change_password":{"success":"(メールを送信しました)","in_progress":"(メールを送信中)","error":"(エラー)","action":"パスワードリセット用メールを送信する","set_password":"パスワードを設定する"},"change_about":{"title":"自己紹介の変更","error":"値変更中にエラーが発生しました。"},"change_username":{"title":"ユーザ名の変更","confirm":"ユーザ名を変更すると、あなたのポストの引用と @ユーザ名でタグ付けされたリンクが解除されます。本当にユーザ名を変更しますか？","taken":"このユーザ名は既に使われています。","error":"ユーザ名変更中にエラーが発生しました。","invalid":"このユーザ名は無効です。英数字のみ利用可能です。"},"change_email":{"title":"メールドレスの変更","taken":"このメールアドレスは既に使われています。","error":"メールアドレス変更中にエラーが発生しました。既にこのアドレスが使われているのかもしれません。","success":"このアドレスにメールを送信しました。メールの指示に従って確認処理を行ってください。"},"change_avatar":{"title":"プロフィール画像を変更","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003eから取得、基準は","gravatar_title":"ウェブサイトのアバターを変更","refresh_gravatar_title":"グラバターを更新する","letter_based":"システムプロフィール画像","uploaded_avatar":"カスタム画像","uploaded_avatar_empty":"カスタム画像を追加","upload_title":"画像をアップロード","upload_picture":"画像アップロード","image_is_not_a_square":"警告: アップロードされた画像はクロップされました。高さと幅が同じ長さではありませんでした。","cache_notice":"プロフィール画像の更新に成功しました。ブラウザのキャッシュのため、反映されるまでに時間がかかる場合があります"},"change_profile_background":{"title":"プロフィール背景","instructions":"プロフィール背景は、幅850pxでセンタリングされます"},"change_card_background":{"title":"ユーザカード背景","instructions":"背景画像は、幅590pxでセンタリングされます"},"email":{"title":"メールアドレス","instructions":"外部に公開されることはありません","ok":"確認用メールを送信します","invalid":"正しいメールアドレスを入力してください","authenticated":"あなたのメールアドレスは {{provider}} によって認証されています"},"name":{"title":"名前","instructions":"フルネーム(任意)","instructions_required":"氏名","too_short":"名前が短すぎます","ok":"よい名前です"},"username":{"title":"ユーザ名","instructions":"空白を含まないユニークな名前を入力してください","short_instructions":"@{{username}} であなたをタグ付けできます","available":"ユーザ名は利用できます","global_match":"メールアドレスが登録済みのユーザ名と一致しました","global_mismatch":"既に利用されています。{{suggestion}} などはいかがでしょう？","not_available":"利用できません。{{suggestion}} などはいかがでしょう？","too_short":"ユーザ名が短すぎます","too_long":"ユーザ名が長過ぎます","checking":"ユーザ名が利用可能か確認しています...","enter_email":"ユーザ名とEメールアドレスが一致","prefilled":"この登録ユーザにマッチするメールアドレスが見つかりました"},"locale":{"title":"表示言語","instructions":"ユーザインタフェイス表示言語。ページを更新する際には、表示言語を更新されます。","default":"既定"},"password_confirmation":{"title":"もう一度パスワードを入力してください。"},"last_posted":"最終投稿","last_emailed":"最終メール","last_seen":"最終アクティビティ","created":"参加時刻","log_out":"ログアウト","location":"所在地","card_badge":{"title":"ユーザカードバッジ"},"website":"ウェブサイト","email_settings":"メール","email_digests":{"title":"サイトを訪れていない場合、ダイジェストをメールで送信する","daily":"毎日","every_three_days":"３日毎","weekly":"毎週","every_two_weeks":"２週間に１回"},"email_direct":"他ユーザから私がタグされた場合、または投稿したポストに返信があった場合、または私のユーザ名にメンションがあった場合、またはトピックへの招待があった場合、メールで通知を受け取る。","email_private_messages":"メッセージを受け取ったときにメールで通知を受け取る。","email_always":"フォーラムにアクティブに参加している状態でも常にメール通知を受け取る","other_settings":"その他","categories_settings":"カテゴリ設定","new_topic_duration":{"label":"以下の条件でトピックを新規と見なす","not_viewed":"未読のもの","last_here":"前回ログアウト後に投稿されたもの"},"auto_track_topics":"自動でトピックをトラックする","auto_track_options":{"never":"トラックしない","immediately":"今すぐ"},"invited":{"search":"招待履歴を検索するためにキーワードを入力してください...","title":"招待","user":"招待したユーザ","redeemed":"受理された招待","redeemed_tab":"受理","redeemed_at":"受理日","pending":"保留中の招待","pending_tab":"保留中","topics_entered":"閲覧したトピック数","posts_read_count":"読んだポスト","expired":"この招待の有効期限が切れました。","rescind":"削除","rescinded":"取り消された招待","reinvite":"招待を再送する","reinvited":"招待を再送しました。","time_read":"リード時間","days_visited":"訪問日数","account_age_days":"アカウント有効日数","create":"友人をこのフォーラムに招待","bulk_invite":{"none":"あなたはまだ誰も招待していません。","text":"ファイルからまとめて招待をする","uploading":"アップロード中...","success":"ファイルは無事にアップロードされました。完了されましたらメッセージでお知らせをさせていただきます。","error":"ファイルアップロードエラー：'{{filename}}': {{message}}"}},"password":{"title":"パスワード","too_short":"パスワードが短すぎます。","common":"このパスワードは他の人が使用している可能性があります。","same_as_username":"パスワードがユーザ名と一致しています","same_as_email":"パスワードとメールアドレスが一致しています","ok":"パスワード OK。","instructions":"%{count} 文字以上の長さにしてください。"},"associated_accounts":"関連アカウント","ip_address":{"title":"最近使用したIPアドレス"},"registration_ip_address":{"title":"登録したときのIPアドレス"},"avatar":{"title":"プロフィール画像","header_title":"プロフィール、メッセージ、ブックマーク、設定"},"title":{"title":"タイトル"},"filters":{"all":"すべて"},"stream":{"posted_by":"投稿者","sent_by":"送信者","private_message":"メッセージ","the_topic":"トピック"}},"loading":"読み込み中...","errors":{"prev_page":"ロード中に","reasons":{"network":"ネットワークエラー","server":"サーバーエラー","forbidden":"アクセス拒否","unknown":"エラー"},"desc":{"network":"インターネット接続を確認してください。","network_fixed":"ネットワーク接続が回復しました。","server":"エラーコード : {{status}}","forbidden":"閲覧する権限がありません","unknown":"エラーが発生しました。"},"buttons":{"back":"戻る","again":"やり直す","fixed":"ページロード"}},"close":"閉じる","assets_changed_confirm":"Discourseはアップデートされました。ページ更新して最新バージョンを導入しますか？","logout":"ログアウトしました","refresh":"Refresh","read_only_mode":{"enabled":"読み取り専用モードが有効になっています。サイトをブラウズすることは引き続き出来ますが、機能は動作しません。","login_disabled":"読み取り専用モードにされています。ログインできません。"},"learn_more":"より詳しく...","year":"年","year_desc":"過去365日間に投稿されたトピック","month":"月","month_desc":"過去30日間に投稿されたトピック","week":"週","week_desc":"過去7日間に投稿されたトピック","day":"日","first_post":"最初のポスト","mute":"ミュート","unmute":"ミュート解除","last_post":"最終投稿時刻","last_reply_lowercase":"最新の回答","replies_lowercase":{"other":"回答"},"summary":{"enabled_description":"トピックのまとめを表示されています。","description":"\u003cb\u003e{{count}}\u003c/b\u003e 返信があります。","description_time":"全てを確認するのに \u003cb\u003e{{readingTime}} 分\u003c/b\u003e 前後を要する \u003cb\u003e{{count}}\u003c/b\u003e 個の回答があります。","enable":"このトピックを要訳する","disable":"全ての投稿を表示する"},"deleted_filter":{"enabled_description":"削除されたポストは非表示にされています。","disabled_description":"削除されたポストは表示されています。","enable":"削除されたポストを非表示にする","disable":"削除されたポストを表示する"},"private_message_info":{"title":"メッセージ","invite":"友人を招待...","remove_allowed_user":"このメッセージから{{name}}を本当に取り除きますか？"},"email":"メール","username":"ユーザ名","last_seen":"最終アクティビティ","created":"作成","created_lowercase":"作成","trust_level":"トラストレベル","search_hint":"ユーザ名、メールアドレスまたはIPアドレス","create_account":{"title":"アカウントの作成","failed":"エラーが発生しました。既にこのメールアドレスは使用中かもしれません。「パスワードを忘れました」リンクを試してみてください"},"forgot_password":{"title":"パスワードリセット","action":"パスワードを忘れました","invite":"ユーザ名かメールアドレスを入力してください。パスワードリセット用のメールを送信します。","reset":"パスワードをリセット","complete_username":"\u003cb\u003e%{username}\u003c/b\u003e,アカウントにパスワード再設定メールを送りました。","complete_email":"\u003cb\u003e%{email}\u003c/b\u003eにパスワード再設定メールを送りました。","complete_username_found":"\u003cb\u003e%{username}\u003c/b\u003e,アカウントにパスワード再設定メールを送りました。","complete_email_found":"\u003cb\u003e%{email}\u003c/b\u003eにパスワード再設定メールを送りました。","complete_username_not_found":" \u003cb\u003e%{username}\u003c/b\u003eのアカウントがありません","complete_email_not_found":"\u003cb\u003e%{email}\u003c/b\u003eで登録したアカウントがありません。"},"login":{"title":"ログイン","username":"ログイン名","password":"パスワード","email_placeholder":"メールアドレスかユーザ名","caps_lock_warning":"Caps Lockがオンになっています。","error":"不明なエラー","rate_limit":"しばらく待ってから再度ログインをお試しください。","blank_username_or_password":"あなたのメールアドレスかユーザ名、そしてパスワードを入力して下さい。","reset_password":"パスワードをリセット","logging_in":"ログイン中...","or":"または","authenticating":"認証中...","awaiting_confirmation":"アカウントはアクティベーション待ち状態です。もう一度アクティベーションメールを送信するには「パスワードを忘れました」リンクをクリックしてください。","awaiting_approval":"アカウントはまだスタッフメンバーに承認されていません。承認され次第メールにてお知らせいたします。","requires_invite":"申し訳ありませんが、このフォーラムは招待制です。","not_activated":"まだログインできません。\u003cb\u003e{{sentTo}}\u003c/b\u003e にアクティベーションメールを送信しております。メールの指示に従ってアカウントのアクティベーションを行ってください。","not_allowed_from_ip_address":"このIPアドレスでログインできません","admin_not_allowed_from_ip_address":"そのIPアドレスからは管理者としてログインできません","resend_activation_email":"再度アクティベーションメールを送信するにはここをクリックしてください。","sent_activation_email_again":"\u003cb\u003e{{currentEmail}}\u003c/b\u003e にアクティベーションメールを再送しました。メール到着まで数分かかることがあります (いつまで立ってもメールが届かない場合は、念のためスパムフォルダの中も確認してみてください)。","google":{"title":"Googleで","message":"Google による認証 (ポップアップがブロックされていないことを確認してください)"},"google_oauth2":{"title":"Googleで","message":"Googleによる認証 (ポップアップがブロックされていないことを確認してください)"},"twitter":{"title":"Twitterで","message":"Twitter による認証 (ポップアップがブロックされていないことを確認してください)"},"facebook":{"title":"Facebookで","message":"Facebook による認証 (ポップアップがブロックされていないことを確認してください)"},"yahoo":{"title":"with Yahoo","message":"Yahoo による認証 (ポップアップがブロックされていないことを確認してください)"},"github":{"title":"with GitHub","message":"Github による認証 (ポップアップがブロックされていないことを確認してください)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","composer":{"emoji":"Emoji :smile:","add_warning":"これは公式の警告です。","posting_not_on_topic":"回答したいトピックはどれですか?","saving_draft_tip":"保存中...","saved_draft_tip":"保存しました","saved_local_draft_tip":"ローカルに保存しました","similar_topics":"このトピックに似ているトピック...","drafts_offline":"オフラインで下書き","error":{"title_missing":"タイトルを入力してください。","title_too_short":"タイトルは{{min}}文字以上必要です。","title_too_long":"タイトルは最長で{{max}}未満です。","post_missing":"ポスト内容が空です。","post_length":"ポストは{{min}}文字以上必要です。","try_like":"\u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e ボタンを試しましたか？","category_missing":"カテゴリを選択してください。"},"save_edit":"編集内容を保存","reply_original":"元のトピックに回答","reply_here":"ここに回答","reply":"回答","cancel":"キャンセル","create_topic":"トピック作成","create_pm":"メッセージ","title":"またはCtrl+Enter","users_placeholder":"ユーザの追加","title_placeholder":"トピックのタイトルを入力してください。","edit_reason_placeholder":"編集する理由は何ですか?","show_edit_reason":"(編集理由を追加)","view_new_post":"新規ポストを見る。","saved":"保存完了!","saved_draft":"編集中の投稿があります。選択すると再開します","uploading":"アップロード中...","show_preview":"プレビューを表示する \u0026raquo;","hide_preview":"\u0026laquo; プレビューを隠す","quote_post_title":"ポスト全体を引用","bold_title":"強調","bold_text":"強調されたテキスト","italic_title":"斜体","italic_text":"斜体のテキスト","link_title":"ハイパーリンク","link_description":"リンクの説明文をここに入力","link_dialog_title":"ハイパーリンクの挿入","link_optional_text":"タイトル(オプション)","quote_title":"ブロック引用","quote_text":"ブロック引用","code_title":"コードサンプル","code_text":"テキストに空白4つのインデントを入れる","upload_title":"アップロード","upload_description":"アップロード内容の説明文をここに入力","olist_title":"番号付きリスト","ulist_title":"箇条書き","list_item":"リストアイテム","heading_title":"見出し","heading_text":"見出し","hr_title":"水平線","help":"Markdown 編集のヘルプ","toggler":"編集パネルの表示/非表示","admin_options_title":"このトピックの詳細設定","auto_close":{"label":"このトピックを自動的に終了する時間:","error":"正しい値を入力してください。","based_on_last_post":"このトピックの最新のポストが古くなるまでは終了しない","all":{"examples":"時間 (例: 24), 時刻(例: 17:30 ), タイムスタンプ(2013-11-22 14:00) を入力してください"},"limited":{"units":"(# of hours)","examples":"時間(24)を入力してください"}}},"notifications":{"title":"@ユーザ名のタグ付けやあなたが投稿した記事やトピックやメッセージなどに対する回答に関する通知","none":"通知はありません","more":"古い通知を確認する","total_flagged":"フラグがたったポストの総数","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e {{description}}バッジを付けられました\u003c/p\u003e","popup":{"mentioned":"\"{{topic}}\"で{{username}} がタグ付けしました - {{site_title}}","quoted":"\"{{topic}}\"で{{username}}が引用しました - {{site_title}}","replied":"\"{{topic}}\"で{{username}}が回答しました - {{site_title}}","posted":"{{username}} が投稿しました \"{{topic}}\" - {{site_title}}","private_message":"\"{{topic}}\"で{{username}}からプライベートメッセージが届きました - {{site_title}}","linked":"\"{{topic}}\"にあるあなたの投稿に{{username}}がリンクしました - {{site_title}}"}},"upload_selector":{"title":"画像のアップロード","title_with_attachments":"画像/ファイルをアップロード","from_my_computer":"このデバイスから","from_the_web":"Web から","remote_tip":"画像へのリンク","local_tip":"ローカルからアップロードする画像を選択","hint":"(アップロードする画像をエディタにドラッグ\u0026ドロップすることもできます)","uploading":"アップロード中","select_file":"ファイル選択","image_link":"イメージのリンク先"},"search":{"title":"トピック、ポスト、ユーザ、カテゴリを探す","no_results":"何も見つかりませんでした。","no_more_results":"これ以上結果が見つかりませんでした。","search_help":"検索ヘルプ","searching":"検索中...","post_format":"#{{post_number}}  {{username}}から","context":{"user":"@{{username}}のポストを検索","category":"\"{{category}}\" カテゴリで検索する","topic":"このトピックを探す","private_messages":"メッセージ検索"}},"go_back":"戻る","not_logged_in_user":"ユーザアクティビティと設定ページ","current_user":"ユーザページに移動","topics":{"bulk":{"reset_read":"未読に設定","delete":"トピックを削除","dismiss_new":"既読に設定","toggle":"選択したトピックを切り替え","actions":"操作","change_category":"カテゴリ変更","close_topics":"トピックを閉じる","archive_topics":"アーカイブトピック","notification_level":"通知レベル変更","choose_new_category":"このトピックへの新しいカテゴリを選択してください","selected":{"other":"あなたは \u003cb\u003e{{count}}\u003c/b\u003e トピックを選択しました。"}},"none":{"unread":"未読トピックはありません。","new":"新着トピックはありません。","read":"まだトピックを一つも読んでいません。","posted":"まだトピックを一つも投稿していません。","latest":"最新のトピックはありません。","hot":"ホットなトピックはありません。","bookmarks":"ブックマークしたトピックはありません。","category":"{{category}} トピックはありません。","top":"トップトピックはありません。","search":"検索結果はありません。","educate":{"new":"２日以内に投稿されたトピックは「最新」トピックとして表示されます。\u003ca href=\"%{userPrefsUrl}\"\u003e設定画面\u003c/a\u003eで日数変更が可能です。","unread":"参加中のトピックに対して新しい投稿がある場合、未読記事として表示されます。"}},"bottom":{"latest":"最新のトピックはこれ以上ありません。","hot":"ホットなトピックはこれ以上ありません。","posted":"ポストのあるトピックはこれ以上ありません。","read":"既読のトピックはこれ以上ありません。","new":"新規トピックはこれ以上ありません。","unread":"未読のトピックはこれ以上ありません。","category":"{{category}} トピックはこれ以上ありません。","top":"トップトピックはこれ以上ありません。","bookmarks":"ブックマーク済みのトピックはこれ以上ありません。","search":"検索結果はこれ以上ありません。"}},"topic":{"filter_to":"トピック内の{{post_count}}個のポストを表示","create":"新規トピック","create_long":"新しいトピックの作成","private_message":"メッセージを書く","list":"トピック","new":"新規トピック","unread":"未読","new_topics":{"other":"{{count}}個の新規トピック"},"unread_topics":{"other":"{{count}}個の未読トピック"},"title":"トピック","invalid_access":{"title":"トピックはプライベートです","description":"申し訳ありませんが、このトピックへのアクセスは許可されていません。","login_required":"ポストを閲覧するには、ログインする必要があります"},"server_error":{"title":"トピックの読み込みに失敗しました","description":"申し訳ありませんが、トピックの読み込みに失敗しました。もう一度試してください。もし問題が継続する場合はお知らせください。"},"not_found":{"title":"トピックが見つかりませんでした","description":"申し訳ありませんがトピックが見つかりませんでした。モデレータによって削除された可能性があります。"},"total_unread_posts":{"other":"このトピックに未読のポストが{{count}}つあります。"},"unread_posts":{"other":"このトピックに未読のポストが{{count}}つあります。"},"new_posts":{"other":"前回閲覧時より、このトピックに新しいポストが{{count}}個投稿されています"},"likes":{"other":"このトピックには{{count}}個「いいね！」がついています"},"back_to_list":"トピックリストに戻る","options":"トピックオプション","show_links":"このトピック内のリンクを表示","toggle_information":"トピック詳細をトグル","read_more_in_category":"{{catLink}} の他のトピックを見る or {{latestLink}}。","read_more":"{{catLink}} or {{latestLink}}。","browse_all_categories":"全てのカテゴリを閲覧する","view_latest_topics":"最新のトピックを見る","suggest_create_topic":"新しいトピックを作成しますか？","jump_reply_up":"以前の回答へジャンプ","jump_reply_down":"以後の回答へジャンプ","deleted":"トピックは削除されました","auto_close_notice":"このトピックは%{timeLeft}で自動的に終了します。","auto_close_notice_based_on_last_post":"このトピックは最後の返信から%{duration} 経つと終了します","auto_close_title":"自動終了設定","auto_close_save":"保存","auto_close_remove":"このトピックを自動終了しない","progress":{"title":"トピック進捗","go_top":"上","go_bottom":"下","go":"へ","jump_bottom":"最後の投稿へ","jump_bottom_with_number":"投稿%{post_number}にジャンプ","total":"ポスト総数","current":"現在のポスト","position":"投稿%{current}/%{total}"},"notifications":{"reasons":{"3_6":"このカテゴリに参加中のため通知されます","3_5":"このトピックに参加中のため通知されます","3_2":"このトピックに参加中のため通知されます。","3_1":"このトピックを作成したため通知されます。","3":"このトピックに参加中のため通知されます。","2_8":"このカテゴリをトラック中のため通知されます。","2_4":"このトピックに回答したため通知されます。","2_2":"このトピックをトラック中のため通知されます。","2":"\u003ca href=\"/users/{{username}}/preferences\"\u003eこのトピックを閲覧した\u003c/a\u003eため通知されます。","1_2":"他ユーザからタグ付けをされた場合、またはあなたの投稿に回答が付いた場合に通知されます","1":"他ユーザからタグ付けをされた場合、またはあなたの投稿に回答が付いた場合に通知されます","0_7":"このカテゴリに関して一切通知を受け取りません。","0_2":"このトピックに関して一切通知を受け取りません。","0":"このトピックに関して一切通知を受け取りません。"},"watching_pm":{"title":"参加中","description":"未読件数と新しい投稿がトピックの横に表示されます。このトピックに対して新しい投稿があった場合に通知されます。"},"watching":{"title":"参加中","description":"未読件数と新しい投稿がトピックの横に表示されます。このトピックに対して新しい投稿があった場合に通知されます。"},"tracking_pm":{"title":"トラック中","description":"新規回答件数がこのメッセージに表示されます。他ユーザから@ユーザ名でタグ付けされた場合、またはあなたの投稿に回答がついた場合に通知されます。"},"tracking":{"title":"トラック中","description":"新規回答件数がこのトピックに表示されます。他ユーザから@ユーザ名でタグ付けされた場合、またはあなたの投稿に回答がついた場合に通知されます。"},"regular":{"description":"他ユーザからタグ付けをされた場合、またはあなたの投稿に回答が付いた場合に通知されます。"},"regular_pm":{"description":"他ユーザからタグ付けをされた場合、またはあなたのメッセージ内の投稿に回答が付いた場合に通知されます。"},"muted_pm":{"title":"ミュートされました","description":"このメッセージについての通知を受け取りません。"},"muted":{"title":"ミュート"}},"actions":{"recover":"トピック削除の取り消し","delete":"トピック削除","open":"トピックを開く","close":"トピックを終了する","multi_select":"投稿の選択。。。","auto_close":"自動終了する。。。","pin":"トピックをピンで留める。。。","unpin":"トピックのピンを取り除く。。。","unarchive":"トピックのアーカイブ解除","archive":"トピックのアーカイブ","invisible":"リストされないようにする","visible":"リストする","reset_read":"読み込みデータをリセット"},"feature":{"pin":"トピックをピンで留める。。。","unpin":"トピックをピンで留める。。。","pin_globally":"トピックを全サイト的にピン留めする","make_banner":"バナートピック","remove_banner":"バナートピックを削除"},"reply":{"title":"回答","help":"このトピックに回答する"},"clear_pin":{"title":"ピンを解除する","help":"このトピックのピンを解除し、トピックリストの先頭に表示されないようにする"},"share":{"title":"シェア","help":"このトピックへのリンクをシェアする"},"flag_topic":{"title":"フラグ","help":"注目したいトピックにフラグを立てることで、それについての通知をプライベートに受け取ることが出来ます","success_message":"このトピックにフラグを立てました。"},"feature_topic":{"title":"トピックを特集","pin":"{{categoryLink}} カテゴリのトップに表示する","confirm_pin":"既に {{count}} 個ピン留めしています。多すぎるピン留めは新規、及び匿名ユーザの負担になる場合があります。このカテゴリの別のトピックのピン留めを続けますか？","unpin":"{{categoryLink}} カテゴリのトップからトピックを削除","unpin_until":"{{categoryLink}} カテゴリのトップからこのトピックを削除するか、\u003cstrong\u003e%{until}\u003c/strong\u003e まで待つ。","pin_note":"ユーザはトピックを個別にピン留め解除することができます","pin_globally":"このトピックをすべてのトピックリストのトップに表示する","confirm_pin_globally":"既に{{count}} 個ピン留めしています。　多すぎるピン留めは新規ユーザと匿名ユーザの負担になる場合があります。ピン留めを続けますか？","unpin_globally":"トピック一覧のトップからこのトピックを削除します","unpin_globally_until":"このトピックをすべてのトピックリストのトップから削除するか、\u003cstrong\u003e%{until}\u003c/strong\u003e まで待つ。","global_pin_note":"ユーザはトピックを個別にピン留め解除することができます","make_banner":"このトピックを全てのページのバナーに表示します","remove_banner":"全てのページのバナーを削除します","banner_note":"ユーザはバナーを閉じることができます。常に１つのトピックだけがバナー表示されます"},"inviting":"招待中...","automatically_add_to_groups_optional":"この招待によって、リストされたグループに参加することができます。","automatically_add_to_groups_required":"この招待によって、リストされたグループに参加することができます。","invite_private":{"title":"メッセージへの参加を招待する","email_or_username":"招待するユーザのメールアドレスまたはユーザ名","email_or_username_placeholder":"メールアドレスまたはユーザ名","action":"招待","success":"ユーザにメッセージへの参加を招待しました。","error":"申し訳ありませんが、ユーザ招待中にエラーが発生しました。","group_name":"グループ名"},"invite_reply":{"title":"友人を招待して回答してもらう","username_placeholder":"ユーザ名","action":"招待状を送る","help":"このトピックに他のユーザをメールまたは通知で招待する。","to_forum":"ログインしなくてもこの投稿に返信ができることを、あなたの友人に知らせます。","sso_enabled":"このトピックに招待したい人のユーザ名を入れてください","to_topic_blank":"このトピックに招待したい人のユーザ名かメールアドレスを入れてください","to_topic_email":"あなたはメールアドレスを入力しました。あなたの友人がすぐにこのトピックに返信をできるように招待状をメールで送信します。","to_topic_username":"ユーザ名を入力しました。このトピックへの招待リンクの通知を送信します。","to_username":"招待したい人のユーザ名を入れてください。このトピックへの招待リンクの通知を送信します。","email_placeholder":"name@example.com","success_email":"\u003cb\u003e{{emailOrUsername}}\u003c/b\u003eに招待を送信しました。招待が受理されたらお知らせします。招待した人はユーザページの招待タブにて確認できます。","success_username":"ユーザにこのトピックへの参加を招待しました。","error":"申し訳ありません。その人を招待できませんでした。すでに招待を送信していませんか？ (招待できる数には限りがあります)"},"login_reply":"ログインして返信","filters":{"n_posts":{"other":"{{count}} ポスト"},"cancel":"フィルター削除"},"split_topic":{"title":"新規トピックに移動","action":"新規トピックに移動","topic_name":"新規トピック名:","error":"新規トピックへのポスト移動中にエラーが発生しました。","instructions":{"other":"新たにトピックを作成し、選択した\u003cb\u003e{{count}}\u003c/b\u003e個のポストをこのトピックに移動しようとしています。"}},"merge_topic":{"title":"既存トピックに移動","action":"既存トピックに移動","error":"指定トピックへのポスト移動中にエラーが発生しました。","instructions":{"other":"これら\u003cb\u003e{{count}}\u003c/b\u003e個のポストをどのトピックに移動するか選択してください。"}},"change_owner":{"title":"ポストの作者を変更する","action":"所有権を変更","error":"所有権の変更ができませんでした。","label":"ポストの新しい所有者","placeholder":"新しい所有者のユーザ名","instructions":{"other":"この {{count}} つのポストの新しい所有者を選択してください。（元所有者：\u003cb\u003e{{old_user}}\u003c/b\u003e）"},"instructions_warn":"このポストについての通知が新しいユーザにさかのぼって転送されることはないので注意してください。\u003cbr\u003e警告: 投稿の関連データの所有権は、新しいユーザに転送されません。 注意して使用してください"},"multi_select":{"select":"選択","selected":"選択中 ({{count}})","select_replies":"全ての回答と共に選択","delete":"選択中のものを削除","cancel":"選択を外す","select_all":"全てを選択する","deselect_all":"全ての選択を外す","description":{"other":"現在\u003cb\u003e{{count}}\u003c/b\u003e個のポストを選択中。"}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"引用して回答","edit":"編集中 {{link}} {{replyAvatar}} {{username}}","edit_reason":"理由: ","post_number":"ポスト{{number}}","last_edited_on":"ポストの最終編集日","reply_as_new_topic":"リンクトピックとして引用返信","continue_discussion":"{{postLink}} からの議論を継続:","follow_quote":"引用ポストに移動","show_full":"全て表示","show_hidden":"隠されたコンテンツを表示する","deleted_by_author":{"other":"(ポストは執筆者により取り下げられました。フラグがつかない場合%{count}時間後に自動的に削除されます)"},"expand_collapse":"展開/折りたたみ","gap":{"other":"{{count}}個の隠された回答を表示する"},"more_links":"{{count}} つリンク...","unread":"未読ポスト","has_replies":{"other":"{{count}} つの回答"},"has_likes":{"other":"{{count}} 個のいいね！"},"has_likes_title":{"other":"{{count}}人のユーザがこの回答に「いいね！」しました"},"errors":{"create":"申し訳ありませんが、ポスト作成中にエラーが発生しました。もう一度やり直してください。","edit":"申し訳ありませんが、ポスト編集中にエラーが発生しました。もう一度やり直してください。","upload":"申し訳ありませんが、ファイルアップロード中にエラーが発生しました。もう一度やり直してください。","attachment_too_large":"申し訳ありませんが、アップロード対象ファイルが大きすぎます (最大サイズは {{max_size_kb}}KB)。","file_too_large":"申し訳ありませんが、アップロード対象ファイルが大きすぎます (最大サイズは {{max_size_kb}}KB)","too_many_uploads":"申し訳ありませんが、複数のファイルは同時にアップロードできません。","too_many_dragged_and_dropped_files":"申し訳ありません。一度にドラッグ\u0026ドロップできるのは10ファイルまでです","upload_not_authorized":"申し訳ありませんが、対象ファイルをアップロードする権限がありません (利用可能な拡張子: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"申し訳ありませんが、新規ユーザは画像のアップロードができません。","attachment_upload_not_allowed_for_new_user":"申し訳ありませんが、新規ユーザはファイルの添付ができません。","attachment_download_requires_login":"ファイルをダウンロードするには、ログインする必要があります"},"abandon":{"confirm":"編集中のポストを破棄してもよろしいですか?","no_value":"いいえ","yes_value":"はい"},"via_email":"メールで投稿されました。","wiki":{"about":"この投稿は「Wiki」である。ベーシックユーザが編集できます。"},"archetypes":{"save":"保存オプション"},"controls":{"reply":"このポストに対する回答の編集を開始","like":"この投稿に「いいね！」する","has_liked":"この投稿に「いいね！」しました。","undo_like":"「いいね！」を取り消す","edit":"この投稿を編集","edit_anonymous":"ポストを編集するには、ログインする必要があります","flag":"このポストにフラグをつける、または通知を送る","delete":"このポストを削除する","undelete":"このポストを元に戻す","share":"このポストのリンクをシェアする","more":"もっと読む","delete_replies":{"confirm":{"other":"このポストに対する{{count}}個の回答を削除しますか?"},"yes_value":"はい、回答も一緒に削除する","no_value":"いいえ、ポストのみ削除する"},"admin":"ポスト管理","wiki":"wiki投稿にする","unwiki":"wiki投稿から外す","convert_to_moderator":"スタッフ色を追加","revert_to_regular":"スタッフ色を削除","rebake":"HTML再建築","unhide":"表示する"},"actions":{"flag":"フラグ","defer_flags":{"other":"デファーフラグ"},"it_too":{"off_topic":"フラグをたてる","spam":"フラグをたてる","inappropriate":"フラグをたてる","custom_flag":"フラグをたてる","bookmark":"ブックマークする","like":"あなたも「いいね！」する","vote":"投票する"},"undo":{"off_topic":"フラグを取り消す","spam":"フラグを取り消す","inappropriate":"フラグを取り消す","bookmark":"ブックマークを取り消す","like":"「いいね！」を取り消す","vote":"投票を取り消す"},"people":{"off_topic":"{{icons}} オフトピックとしてマーク","spam":"{{icons}} スパムとしてマーク","spam_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eスパムとして\u003c/a\u003eフラグ付き","inappropriate":"{{icons}} 不適切であると報告するフラグを立つ","notify_moderators":"{{icons}} がモデレータに通報しました","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003e通知されたモデレータ\u003c/a\u003e","notify_user":"{{icons}} メッセージを送信しました","notify_user_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eメッセージ\u003c/a\u003eを送信しました","bookmark":"{{icons}} がブックマークしました","like":"{{icons}} が「いいね！」しています","vote":"{{icons}} が投票しました"},"by_you":{"off_topic":"オフトピックのフラグを立てました","spam":"スパムを報告するフラグを立てました","inappropriate":"不適切であると報告するフラグを立てました","notify_moderators":"モデレータ確認を必要とするというフラグを立てました","notify_user":"このユーザにメッセージを送信しました","bookmark":"このポストをブックマークしました","like":"あなたが「いいね！」しました","vote":"あなたがこのポストに投票しました"},"by_you_and_others":{"off_topic":{"other":"あなたと他{{count}}人がオフトピックであるとフラグを立てました"},"spam":{"other":"あなたと他{{count}}人がスパムであるとフラグを立てました"},"inappropriate":{"other":"あなたと他{{count}}人が不適切であるとフラグを立てました"},"notify_moderators":{"other":"あなたと他{{count}}人がモデレータ確認を要するとフラグを立てました"},"notify_user":{"other":"あなたと他{{count}}人がこのユーザにメッセージを送信しました"},"bookmark":{"other":"あなたと他{{count}}人がこのポストをブックマークしました"},"like":{"other":"あなたと他{{count}}人が「いいね！」しました"},"vote":{"other":"あなたと他{{count}}人がこのポストに投票しました"}},"by_others":{"off_topic":{"other":"{{count}}人のユーザがオフトピックであるとフラグを立てました"},"spam":{"other":"{{count}}人のユーザがスパムであるとフラグを立てました"},"inappropriate":{"other":"{{count}}人のユーザが不適切であるとフラグを立てました"},"notify_moderators":{"other":"{{count}}人のユーザがモデレータ確認を要するとフラグを立てました"},"notify_user":{"other":"{{count}} 人がこのユーザにメッセージを送信しました"},"bookmark":{"other":"{{count}}人のユーザがこのポストをブックマークしました"},"like":{"other":"{{count}}人のユーザが「いいね！」しました"},"vote":{"other":"{{count}}人のユーザがこのポストに投票しました"}}},"delete":{"confirm":{"other":"本当にこれらのポストを削除しますか?"}},"revisions":{"controls":{"first":"最初のリビジョン","previous":"一つ前のリビジョン","next":"次のリビジョン","last":"最後のリビジョン","hide":"リビジョンを隠す","show":"リビジョンを表示","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"追加・削除箇所をインラインで表示","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"差分を横に並べて表示","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"ソース文書で表示する","button":"ソース文書"}}}},"category":{"can":"can\u0026hellip; ","none":"(カテゴリなし)","all":"全てのカテゴリ","choose":"カテゴリを選択\u0026hellip;","edit":"編集","edit_long":"カテゴリを編集","view":"カテゴリ内のトピックを見る","general":"一般","settings":"設定","topic_template":"トピックテンプレート","delete":"カテゴリを削除する","create":"新しいカテゴリ","save":"カテゴリを保存する","slug":"カテゴリスラグ","slug_placeholder":"(任意)URL用","creation_error":"カテゴリの作成に失敗しました。","save_error":"カテゴリの保存に失敗しました。","name":"カテゴリ名","description":"カテゴリ内容","topic":"カテゴリトピック","logo":"カテゴリロゴ画像","background_image":"カテゴリ背景画像","badge_colors":"バッジの色","background_color":"背景色","foreground_color":"文字表示色","name_placeholder":"簡潔な名前にしてください。","color_placeholder":"任意の Web カラー","delete_confirm":"本当にこのカテゴリを削除してもよいですか?","delete_error":"カテゴリ削除に失敗しました。","list":"カテゴリをリストする","no_description":"このカテゴリの説明はありません。トピック定義を編集してください。","change_in_category_topic":"カテゴリ内容を編集","already_used":"この色は他のカテゴリで利用しています","security":"セキュリティ","images":"画像","auto_close_label":"トピックを自動的に閉じるまでの時間:","auto_close_units":"時間","email_in":"カスタムメールアドレス:","email_in_allow_strangers":"登録されていないユーザからメールを受けとります。","email_in_disabled":"メールでの新規投稿は、サイトの設定で無効になっています。メールでの新規投稿を有効にするには","email_in_disabled_click":"\"email in\"設定を有効にしてください","allow_badges_label":"このカテゴリでバッジが付与されることを許可","edit_permissions":"パーミッションを編集","add_permission":"パーミッションを追加","this_year":"今年","position":"ポジション","default_position":"デフォルトポジション","position_disabled":"カテゴリはアクティビティで並び替えられます。カテゴリ一覧の順番を制御するには","position_disabled_click":"「固定されたケテゴリーの位置付け」の設定を有効にしてください。","parent":"親カテゴリ","notifications":{"watching":{"title":"カテゴリ参加中"},"tracking":{"title":"トラック中"},"regular":{"description":"他ユーザからタグ付けをされた場合、またはあなたの投稿に回答が付いた場合に通知されます。"},"muted":{"title":"ミュート中"}}},"flagging":{"title":"私達のコミュニティの維持を助けてくれてありがとうごうざいます","private_reminder":"フラグはプライベートです。スタッフ\u003cb\u003eのみ\u003c/b\u003eが参照できます","action":"フラグをつける","take_action":"アクションをする","notify_action":"メッセージ","delete_spammer":"スパマーの削除","delete_confirm":"このユーザによる\u003cb\u003e%{posts}\u003c/b\u003e個のポストと\u003cb\u003e%{topics}\u003c/b\u003e個のトピックを削除し、アカウントを削除し、このユーザのメールアドレス \u003cb\u003e%{email}\u003c/b\u003e をブロックリストに追加しようとしています。本当にこのユーザをスマパー認定してもよいですか?","yes_delete_spammer":"はい、スパマーを削除する","ip_address_missing":"(N/A)","hidden_email_address":"(hidden)","submit_tooltip":"プライベートフラグを通知する","take_action_tooltip":"コミュニティのフラグを待つのではなく、すぐにフラグを始めましょう","cant":"申し訳ありませんが、現在このポストにフラグを立てることはできません。","formatted_name":{"off_topic":"オフトピック","inappropriate":"不適切","spam":"スパム"},"custom_placeholder_notify_user":"具体的に、建設的に、そして常に親切にしましょう。","custom_placeholder_notify_moderators":"特に何を懸念しているかを伝えてください。可能な場合、関連するリンクや例を提供してください。","custom_message":{"at_least":"少なくとも{{n}}文字入力してください","more":"あと{{n}}文字...","left":"残り{{n}}文字"}},"flagging_topic":{"title":"私達のコミュニティの維持を助けてくれてありがとうごうざいます","action":"トピックにフラグを立てる","notify_action":"メッセージ"},"topic_map":{"title":"トピックのサマリー","participants_title":"常連投稿者","links_title":"人気のリンク","links_shown":"全{{totalLinks}}リンクを表示...","clicks":{"other":"%{count} クリック"}},"topic_statuses":{"warning":{"help":"これは公式の警告です。"},"bookmarked":{"help":"このトピックをブックマークしました"},"locked":{"help":"このトピックは終了しています。新たに回答を投稿することはできません。"},"archived":{"help":"このトピックはアーカイブされています。凍結状態のため一切の変更ができません"},"unpinned":{"title":"ピン留め解除しました","help":"このトピックはピン留めされていません。 既定の順番に表示されます。"},"pinned_globally":{"title":"全サイト的にピン留めされました"},"pinned":{"title":"ピン留め","help":"このトピックはピン留めされています。常にカテゴリのトップに表示されます"},"invisible":{"help":"このトピックはリストされていません。トピックリストには表示されません。直接リンクでのみアクセス可能です"}},"posts":"投稿","posts_lowercase":"投稿","posts_long":"このトピックには{{number}}個のポストがあります","original_post":"大元のポスト","views":"閲覧","views_lowercase":{"other":" 閲覧"},"replies":"回答","views_long":"このトピックは{{number}}回閲覧されました","activity":"アクティビティ","likes":"いいね！","likes_lowercase":{"other":"いいね！"},"likes_long":"このトピックには{{number}}つ「いいね！」がついています","users":"ユーザ","users_lowercase":{"other":"ユーザ"},"category_title":"カテゴリ","history":"History","changed_by":"by {{author}}","raw_email":{"title":"メール","not_available":"利用不可"},"categories_list":"カテゴリ一覧","filters":{"with_topics":"%{filter} トピック","with_category":"%{filter} %{category} トピック","latest":{"help":"最新のトピック"},"hot":{"title":"ホット","help":"話題のトピック"},"read":{"title":"既読","help":"既読のトピックを、最後に読んだ順に表示"},"search":{"title":"検索","help":"すべてのトピックを検索"},"categories":{"title":"カテゴリ","title_in":"カテゴリ - {{categoryName}}","help":"カテゴリ毎に整理されたトピックを表示"},"unread":{"help":"未読ポストのあるトピック"},"new":{"lower_title":"新着","help":"最近投稿されたトピック"},"posted":{"title":"あなたのポスト","help":"あなたが投稿したトピック"},"bookmarks":{"title":"ブックマーク","help":"ブックマークしたトピック"},"category":{"help":"{{categoryName}} カテゴリの最新トピック"},"top":{"title":"トップ","help":"過去年間、月間、週間及び日間のアクティブトピック","all":{"title":"今まで"},"yearly":{"title":"今年"},"quarterly":{"title":"３ヶ月おき"},"monthly":{"title":"今月"},"weekly":{"title":"毎週"},"daily":{"title":"毎日"},"all_time":"今まで","this_year":"年","this_quarter":"季刊","this_month":"月","this_week":"週","today":"本日","other_periods":"次の期間のトピックを見る"}},"browser_update":"\u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eここで動作するにはブラウザのバージョンが古すぎます。\u003c/a\u003e 。 \u003ca href=\"http://browsehappy.com\"\u003eここでブラウザアップグレード\u003c/a\u003e.","permission_types":{"full":"作成できる / 回答できる / 閲覧できる","create_post":"回答できる / 閲覧できる","readonly":"閲覧できる"},"poll":{"voters":{"other":"投票者数"},"total_votes":{"other":"合計得票数"},"average_rating":"平均評価: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"between_min_and_max_options":"\u003cstrong\u003e%{min}\u003c/strong\u003e と \u003cstrong\u003e%{max}\u003c/strong\u003e のオプションから選択することができます。"}},"cast-votes":{"title":"投票する","label":"すぐ投票！"},"show-results":{"title":"投票結果を表示","label":"結果を表示"},"hide-results":{"title":"あなたの投票に戻る","label":"結果を非表示にする"},"open":{"title":"投票を開く","label":"開く","confirm":"この投票をオープンにしてもよろしいですか？"},"close":{"title":"投票を終了","label":"閉じる","confirm":"この投票を終了してもよろしいですか？"},"error_while_toggling_status":"投票の状態を切り替え中にエラーが発生しました。","error_while_casting_votes":"投票中にエラーが発生しました。"},"type_to_filter":"設定項目の絞り込み...","admin":{"title":"Discourse 管理者","moderator":"モデレータ","dashboard":{"title":"ダッシュボード","last_updated":"ダッシュボード最終更新:","version":"Version","up_to_date":"最新のバージョンです!","critical_available":"重要度の高いアップデートが存在します。","updates_available":"アップデートが存在します。","please_upgrade":"今すぐアップデートしてください!","no_check_performed":"アップデートの確認が正しく動作していません。sidekiq が起動していることを確認してください。","stale_data":"最近アップデートの確認が正しく動作していません。sidekiq が起動していることを確認してください。","version_check_pending":"まるでアップデート直後のようです。素晴らしい！","installed_version":"Installed","latest_version":"Latest","problems_found":"Discourse のインストールにいくつか問題が発見されました:","last_checked":"最終チェック","refresh_problems":"更新","no_problems":"問題は見つかりませんでした。","moderators":"モデレータ:","admins":"管理者:","blocked":"ブロック中:","suspended":"停止中:","private_messages_short":"メッセージ","private_messages_title":"メッセージ","mobile_title":"モバイル","space_free":"{{size}} free","uploads":"アップロード","backups":"バックアップ","traffic_short":"トラフィック","traffic":"Application web requests","page_views":"API Requests","page_views_short":"API Requests","show_traffic_report":"Show Detailed Traffic Report","reports":{"today":"今日","yesterday":"昨日","last_7_days":"過去7日","last_30_days":"過去30日","all_time":"All Time","7_days_ago":"7日前","30_days_ago":"30日前","all":"全て","view_table":"table","view_chart":"bar chart","refresh_report":"Refresh Report","start_date":"Start Date","end_date":"End Date"}},"commits":{"latest_changes":"最新の更新内容:","by":"by"},"flags":{"title":"フラグ","old":"古いフラグ","active":"アクティブなフラグ","agree":"賛成","agree_title":"有効かつ正しいとしてフラグを確認","agree_flag_modal_title":"Agree and...","agree_flag_hide_post":"賛成(ポスト非表示 + プライベートメッセージ送信)","agree_flag_hide_post_title":"このポストを非表示にし、編集を促すプライベートメッセージを自動的に送信","agree_flag_restore_post":"賛成(投稿を復元)","agree_flag_restore_post_title":"この投稿を復元","agree_flag":"フラグに賛成する","agree_flag_title":"フラグとポストを変更しないことに賛成","defer_flag":"Defer","defer_flag_title":"フラグを削除します。何のアクションも必要としません","delete":"削除する","delete_title":"このフラグが参照しているポストを削除","delete_post_defer_flag":"投稿を削除し、フラグを外す","delete_post_defer_flag_title":"投稿を削除する。もしこの最初の投稿を削除すると、トピックも削除されます。","delete_post_agree_flag":"投稿を削除し、フラグに賛成","delete_post_agree_flag_title":"投稿を削除する。もしこの最初の投稿を削除すると、トピックも削除されます。","delete_flag_modal_title":"Delete and...","delete_spammer":"スパムユーザーを削除","delete_spammer_title":"ユーザとそのユーザが投稿した全てのポストとトピックを削除します","disagree_flag_unhide_post":"反対する（投稿を表示する）","disagree_flag_unhide_post_title":"投稿に付けたフラグを削除する。ポストを表示する","disagree_flag":"反対する","disagree_flag_title":"無効または、不正としてこのフラグを拒否","clear_topic_flags":"トピックのフラグをクリアしました","clear_topic_flags_title":"このトピックについての問題が解決されました。「完了」をクリックしてフラグを外します。","more":"(more replies...)","dispositions":{"agreed":"賛成した。","disagreed":"反対する","deferred":"deferred"},"flagged_by":"フラグを立てた人","resolved_by":"解決方法","took_action":"Took action","system":"システム","error":"何らかの理由でうまくいきませんでした","reply_message":"返信する","no_results":"フラグはありません。","topic_flagged":"この \u003cstrong\u003eトピック\u003c/strong\u003e はフラグされました。","visit_topic":"トピックを閲覧して問題を調査してくさだい","was_edited":"最初のフラグ後に編集されたポスト","previous_flags_count":"このポストは既に {{count}} 回フラグされています","summary":{"action_type_3":{"other":"オフトピック x{{count}}"},"action_type_4":{"other":"不適切 x{{count}}"},"action_type_6":{"other":"カスタム x{{count}}"},"action_type_7":{"other":"カスタム x{{count}}"},"action_type_8":{"other":"スパム x{{count}}"}}},"groups":{"primary":"プライマリーグループ","no_primary":"（プライマリーグループなし）","title":"グループ","edit":"グループの編集","refresh":"リフレッシュ","new":"新規","selector_placeholder":"ユーザ名を入力","name_placeholder":"グループ名を入力 (ユーザ名同様にスペースなし)","about":"グループメンバーとグループ名を編集","group_members":"グループメンバー","delete":"削除","delete_confirm":"このグループを削除しますか?","delete_failed":"グループの削除に失敗しました。自動作成グループを削除することはできません。","delete_member_confirm":"'%{group}' グループから'%{username}' を削除しますか?","name":"名前","add":"追加","add_members":"メンバー追加","custom":"カスタム","automatic":"自動的","automatic_membership_email_domains":"リスト内のメールアドレスのドメインに正確に一致したユーザは自動的にグループに追加される","automatic_membership_retroactive":"同じメールアドレスドメインのルールを既に登録済みのユーザにも適用","default_title":"このグループのすべてのユーザーのデフォルトタイトル","primary_group":"自動的にプライマリグループとして設定"},"api":{"generate_master":"マスターAPIキーを生成","none":"現在アクティブなAPIキーが存在しません。","user":"ユーザ","title":"API","key":"Key","generate":"API キーを生成","regenerate":"API キーを再生成","revoke":"無効化","confirm_regen":"このAPIキーを新しいものに置き換えてもよろしいですか?","confirm_revoke":"このキーを無効化しても本当によろしいですか?","info_html":"API キーを使うと、JSON 呼び出しでトピックの作成・更新を行うことが出来ます。","all_users":"全てのユーザ","note_html":"このキーは、秘密にしてください。このキーを持っている全てのユーザは任意のユーザとして、任意のポストを作成できます"},"plugins":{"title":"プラグイン","installed":"インストール済みプラグイン","name":"名前","none_installed":"インストール済みのプラグインはありません","version":"バージョン","enabled":"有効","is_enabled":"有効","not_enabled":"無効","change_settings":"設定変更","change_settings_short":"設定","howto":"プラグインをインストールするには？"},"backups":{"title":"バックアップ","menu":{"backups":"バックアップ","logs":"ログ"},"none":"バックアップはありません","read_only":{"enable":{"title":"読み取り専用モードに有効する","label":"読み取り専用モードを有効","confirm":"本当に読み取り専用モードを有効しますか？"},"disable":{"title":"読み取り専用モードを無効にする","label":"読み取り専用モードを無効"}},"logs":{"none":"ログがありません"},"columns":{"filename":"ファイル名","size":"サイズ"},"upload":{"label":"アップロード","title":"このインスタンスにバックアップをアップロード","uploading":"アップロード中","success":"ファイル'{{filename}}' がアップロードされました。","error":"ファイル '{{filename}}'アップロードエラー: {{message}}"},"operations":{"is_running":"バックアップ作業を実行中...","failed":"{{operation}}失敗しました。ログをチェックください。","cancel":{"label":"キャンセル","title":"バックアップ作業をキャンセルする","confirm":"本当に実行中バックアップ作業をキャンセルしますか？"},"backup":{"label":"バックアップ","title":"バックアップを作成します","confirm":"新しいバックアップを作成したいですか？","without_uploads":"はい(ファイルは含まない)"},"download":{"label":"ダウンロード","title":"バックアップをダウンロード"},"destroy":{"title":"バックアップを削除","confirm":"このバックアップを削除しますか？"},"restore":{"is_disabled":"バックアップ復元を無効にされています。","label":"復元","title":"バックアップを復元","confirm":"本当にバックアップを復元しますか？"},"rollback":{"label":"ロールバック","title":"データベースを元の作業状態にロールバックする","confirm":"本当にデータベースを元の作業状態にロールバックしますか？"}}},"export_csv":{"user_archive_confirm":"あなたのポストをダウンロードしてよいですか？","success":"エスクポートを開始しました。処理が完了すると、メッセージで通知されます。","failed":"出力失敗。詳しくはログに参考してください。","rate_limit_error":"ポストは１日１回ダウンロードできます。明日試してください","button_text":"エクスポート","button_title":{"user":"全てのユーザをCSV出力","staff_action":"スタッフの操作ログをCSV出力","screened_email":"全てのスクリーンメールアドレスをCSV出力","screened_ip":"全てのスクリーンIPリストをCSV出力","screened_url":"全てのスクリーンURLリストをCSV出力"}},"export_json":{"button_text":"エクスポート"},"invite":{"button_text":"招待を送信","button_title":"招待を送信"},"customize":{"title":"カスタマイズ","long_title":"サイトのカスタマイズ","css":"CSS","header":"ヘッダ","top":"トップ","footer":"フッター","head_tag":{"text":"\u003c/head\u003e","title":"\u003c/head\u003eタグの前に挿入されるHTML"},"body_tag":{"text":"\u003c/body\u003e","title":"\u003c/body\u003eタグの前に挿入されるHTML"},"override_default":"標準のスタイルシートを読み込まない","enabled":"有効にする","preview":"プレビュー","undo_preview":"プレビューを削除","rescue_preview":"既定スタイル","explain_preview":"カスタムスタイルシートでサイトを表示する","explain_undo_preview":"有効しているカスタムスタイルシートに戻る","explain_rescue_preview":"既定スタイルシートでサイトを表示する","save":"保存","new":"新規","new_style":"新規スタイル","import":"インポート","import_title":"ファイルを選択するかテキストをペースト","delete":"削除","delete_confirm":"このカスタマイズ設定を削除しますか?","about":"サイトカスタマイズ設定により、サイトのヘッダとスタイルシートを変更できます。設定を選択するか、編集を開始して新たな設定を追加してください。","color":"色","opacity":"透明度","copy":"コピー","css_html":{"title":"CSS, HTML","long_title":"CSS と HTML のカスタマイズ"},"colors":{"title":"色","long_title":"色スキーマ","about":"CSSを記述することなくサイトのカラーを変更できます。スキームを追加して始めてください","new_name":"新しい色スキーム","copy_name_prefix":"のコピー","delete_confirm":"このカラースキームを削除しますか？","undo":"取り消す","undo_title":"変更を元に戻して、前回保存されたカラーにします","revert":"取り戻す","revert_title":"既定の配色に戻る","primary":{"name":"プライマリー","description":"テキスト、アイコンと枠の色"},"secondary":{"name":"セカンダリー","description":"メイン背景とボタンのテキスト色"},"tertiary":{"name":"ターシャリ","description":"リンク、いくつかのボタン、通知、アクセントカラー"},"quaternary":{"name":"クォータナリ","description":"ナビゲーションリンク"},"header_background":{"name":"ヘッダー背景","description":"ヘッダー背景色"},"header_primary":{"name":"ヘッダープライマリー","description":"サイトヘッダーのテキストとアイコン"},"highlight":{"name":"ハイライト","description":"ポストやトピックといった、ページのハイライトされた要素の背景色"},"danger":{"name":"危険","description":"ポストやトピックの削除などのアクションのハイライトカラー"},"success":{"name":"成功","description":"操作が成功したことを示すために使用します"},"love":{"name":"love","description":"ライクボタンの色"},"wiki":{"name":"wiki","description":"Wiki投稿の背景に使用する基本色"}}},"email":{"title":"メール","settings":"設定","all":"全て","sending_test":"テストメールを送信中...","error":"\u003cb\u003eERROR\u003c/b\u003e - %{server_error}","test_error":"テストメールを送れませんでした。メール設定、またはホストをメールコネクションをブロックされていないようを確認してください。","sent":"送信済み","skipped":"スキップ済み","sent_at":"送信時間","time":"日付","user":"ユーザ","email_type":"メールタイプ","to_address":"送信先アドレス","test_email_address":"テスト用メールアドレス","send_test":"テストメールを送る","sent_test":"送信完了!","delivery_method":"送信方法","preview_digest":"ダイジェストのプレビュー","refresh":"更新","format":"フォーマット","html":"html","text":"text","last_seen_user":"ユーザが最後にサイトを訪れた日:","reply_key":"回答キー","skipped_reason":"スキップの理由","logs":{"none":"ログなし","filters":{"title":"フィルター","user_placeholder":"ユーザ名","address_placeholder":"name@example.com","type_placeholder":"ダイジェスト、サインアップ...","reply_key_placeholder":"回答キー","skipped_reason_placeholder":"理由"}}},"logs":{"title":"ログ","action":"アクション","created_at":"作成","last_match_at":"最終マッチ","match_count":"マッチ","ip_address":"IP","topic_id":"トピックID","post_id":"ポストID","delete":"削除","edit":"編集","save":"保存","screened_actions":{"block":"ブロック","do_nothing":"何もしない"},"staff_actions":{"title":"スタッフ操作","instructions":"ユーザ名、アクションをクリックすると、リストはフィルタされます。プロフィール画像をクリックするとユーザページに遷移します","clear_filters":"全てを表示する","staff_user":"スタッフユーザ","target_user":"対象ユーザ","subject":"対象","when":"いつ","context":"コンテンツ","details":"詳細","previous_value":"変更前","new_value":"変更後","diff":"差分を見る","show":"詳しく見る","modal_title":"詳細","no_previous":"変更前の値がありません。","deleted":"変更後の値がありません。レコードが削除されました。","actions":{"delete_user":"ユーザを削除","change_trust_level":"トラストレベルを変更","change_username":"ユーザ名変更","change_site_setting":"サイトの設定を変更","change_site_customization":"サイトのカスタマイズ設定を変更","delete_site_customization":"サイトのカスタマイズ設定を削除","suspend_user":"ユーザをサスペンドにする","unsuspend_user":"ユーザのサスペンドを解除する","grant_badge":"バッジを付ける","revoke_badge":"バッジを取り消す","check_email":"メールアドレスを表示する","delete_topic":"トピック削除","delete_post":"ポスト削除","impersonate":"なりすまし","anonymize_user":"匿名ユーザ","roll_up":"IPブロックをロールアップ"}},"screened_emails":{"title":"ブロック対象アドレス","description":"新規アカウント作成時、次のメールアドレスからの登録をブロックする。","email":"メールアドレス","actions":{"allow":"許可する"}},"screened_urls":{"title":"ブロック対象URL","description":"スパマーからのポストにおいて引用されていた URL のリスト。","url":"URL","domain":"ドメイン"},"screened_ips":{"title":"スクリーン対象IP","description":"参加中のIPアドレス。IPアドレスをホワイトリストに追加するには \"許可\" を利用してください。","delete_confirm":"%{ip_address} のルールを本当に削除しますか?","roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?","rolled_up_some_subnets":"Successfully rolled up IP ban entries to these subnets: %{subnets}.","rolled_up_no_subnet":"There was nothing to roll up.","actions":{"block":"ブロック","do_nothing":"許可","allow_admin":"Allow Admin"},"form":{"label":"新規:","ip_address":"IPアドレス","add":"追加","filter":"Search"},"roll_up":{"text":"Roll up","title":"Creates new subnet ban entries if there are at least 'min_ban_entries_for_roll_up' entries."}},"logster":{"title":"エラーログ"}},"impersonate":{"title":"ユーザになる","help":"Use this tool to impersonate a user account for debugging purposes. You will have to log out once finished.","not_found":"ユーザが見つかりませんでした。","invalid":"申し訳ありませんがこのユーザとして使えません。"},"users":{"title":"ユーザ","create":"管理者を追加","last_emailed":"最終メール","not_found":"このユーザネームはシステムに存在しません。","id_not_found":"申し訳ありません。そのユーザIDはシステムに存在していません","active":"アクティブ","show_emails":"メールアドレス参照","nav":{"new":"新規","active":"アクティブ","pending":"保留中","staff":"スタッフ","suspended":"サスペンド中","blocked":"ブロック中","suspect":"サスペクト"},"approved":"承認?","approved_selected":{"other":"承認ユーザ ({{count}})"},"reject_selected":{"other":"拒否ユーザ ({{count}})"},"titles":{"active":"アクティブユーザ","new":"新規ユーザ","pending":"保留中のユーザ","newuser":"トラストレベル0のユーザ (新規ユーザ)","basic":"トラストレベル1のユーザ (ベーシックユーザ)","staff":"スタッフ","admins":"管理者ユーザ","moderators":"モデレータ","blocked":"ブロック中のユーザ","suspended":"サスペンド中のユーザ","suspect":"サスペクトユーザ"},"reject_successful":{"other":"%{count}人のユーザの拒否に成功しました。"},"reject_failures":{"other":"%{count}人のユーザの拒否に失敗しました。"},"not_verified":"検証されていません","check_email":{"title":"メールアドレスを表示する","text":"表示する"}},"user":{"suspend_failed":"ユーザのサスペンドに失敗しました {{error}}","unsuspend_failed":"ユーザのサスペンド解除に失敗しました {{error}}","suspend_duration":"ユーザを何日間サスペンドしますか?","suspend_duration_units":"(日)","suspend_reason_label":"サスペンドする理由を簡潔に説明してください。ここに書いた理由は、このユーザのプロファイルページにおいて\u003cb\u003e全員が閲覧可能な状態\u003c/b\u003eで公開されます。またこのユーザがログインを試みた際にも表示されます。","suspend_reason":"理由","suspended_by":"サスペンドしたユーザ","delete_all_posts":"全てのポストを削除","delete_all_posts_confirm":"%{posts}個のポストと%{topics}個のトピックが削除されます。よろしいですか?","suspend":"サスペンド","unsuspend":"サスペンド解除","suspended":"サスペンド中?","moderator":"モデレータ?","admin":"管理者?","blocked":"ブロック中?","show_admin_profile":"管理者","edit_title":"タイトルを編集","save_title":"タイトルを保存","refresh_browsers":"ブラウザを強制リフレッシュ","refresh_browsers_message":"全てのクライアントにメッセージが送信されました！","show_public_profile":"一般プロファイルを表示","impersonate":"このユーザになりすます","ip_lookup":"IP検索","log_out":"ログアウト","logged_out":"すべてのデバイスでログアウトしました","revoke_admin":"管理者権限を剥奪","grant_admin":"管理者権限を付与","revoke_moderation":"モデレータ権限を剥奪","grant_moderation":"モデレータ権限を付与","unblock":"ブロック解除","block":"ブロック","reputation":"レピュテーション","permissions":"パーミッション","activity":"アクティビティ","like_count":"「いいね！」付けた/もらった数","last_100_days":"過去100日に","private_topics_count":"プライベートトピック数","posts_read_count":"読んだポスト数","post_count":"投稿したポスト数","topics_entered":"閲覧したトピック数","flags_given_count":"設定したフラグ数","flags_received_count":"設定されたフラグ数","warnings_received_count":"警告をもらった","flags_given_received_count":"フラグを与えた/もらった","approve":"承認","approved_by":"承認したユーザ","approve_success":"ユーザが承認され、アクティベーション方法を記載したメールが送信されました。","approve_bulk_success":"成功!！選択したユーザ全員が承認され、メールが送信されました。","time_read":"リード時間","anonymize":"匿名ユーザ","anonymize_confirm":"このアカウントと匿名化してよいですか？ユーザ名、メールアドレスが変更され、全てのプロフィール情報がリセットされます","anonymize_yes":"はい。アカウントを匿名化してください","anonymize_failed":"アカウントの匿名化中に問題が発生しました","delete":"ユーザを削除","delete_forbidden_because_staff":"管理者およびモデレータアカウントは削除できません。","delete_posts_forbidden_because_staff":"管理者、モデレータの全てのポストは削除できません","delete_forbidden":{"other":"ポスト投稿済のユーザは削除できません。ユーザ削除の前に全てのポストを削除してください。（投稿後%{count}日以上が経過したポストは削除できません ）"},"cant_delete_all_posts":{"other":"全ての投稿を削除できませんでした。%{count}日以上が経過した投稿があります。（設定：delete_user_max_post_age）"},"cant_delete_all_too_many_posts":{"other":"全てのポストを削除できませんでした。ユーザは%{count} つ以上のポストを投稿しています。(delete_all_posts_max)"},"delete_confirm":"本当にこのユーザを削除しますか？","delete_and_block":" 削除する。このメールとIPアドレスからのサインアップを以後\u003cb\u003eブロック\u003c/b\u003e","delete_dont_block":"削除する","deleted":"ユーザが削除されました。","delete_failed":"ユーザ削除中にエラーが発生しました。このユーザの全てのポストを削除したことを確認してください。","send_activation_email":"アクティベーションメールを送信","activation_email_sent":"アクティベーションメールが送信されました。","send_activation_email_failed":"アクティベーションメールの送信に失敗しました。 %{error}","activate":"アカウントのアクティベート","activate_failed":"ユーザのアクティベートに失敗しました。","deactivate_account":"アカウントのアクティベート解除","deactivate_failed":"ユーザのアクティベート解除に失敗しました。","unblock_failed":"ユーザのブロック解除に失敗しました。","block_failed":"ユーザのブロックに失敗しました。","deactivate_explanation":"アクティベート解除されたユーザは、メールで再アクティベートする必要があります。","suspended_explanation":"サスペンド中のユーザはログインできません。","block_explanation":"ブロック中のユーザはポストの投稿およびトピックの作成ができません。","trust_level_change_failed":"ユーザのトラストレベル変更に失敗しました。","suspend_modal_title":"サスペンド中ユーザ","trust_level_2_users":"トラストレベル2のユーザ","trust_level_3_requirements":"トラストレベル3の条件","trust_level_locked_tip":"トラストレベルはロックされています。システムがユーザを昇格、降格させることはありません","trust_level_unlocked_tip":"トラストレベルはアンロックされています。システムはユーザを昇格、降格させます","lock_trust_level":"トラストレベルをロック","unlock_trust_level":"トラストレベルをアンロック","tl3_requirements":{"title":"トラストレベル3の条件","table_title":"過去100日に：","value_heading":"値","requirement_heading":"条件","visits":"訪問","days":"日","topics_replied_to":"回答したトピック","topics_viewed":"閲覧したトピック数","topics_viewed_all_time":"閲覧したトピック","posts_read":"閲覧したポスト数","posts_read_all_time":"閲覧したポスト数","flagged_posts":"フラグ付きのポスト","flagged_by_users":"フラグを立ったユーザ","likes_given":"与えた「いいね！」","likes_received":"もらった「いいね！」","likes_received_days":"「いいね！」数：日別","likes_received_users":"「いいね！」数： ユーザ別","qualifies":"トラストレベル3の条件を満たしています。","does_not_qualify":"トラストレベル3の条件を満たしていません。","will_be_promoted":"もうすぐ昇格します","will_be_demoted":"もうすぐ降格します","on_grace_period":"現在の昇格期間中は、降格されません","locked_will_not_be_promoted":"トラストレベルはロックされています。昇格することはありません","locked_will_not_be_demoted":"トラストレベルはロックされています。降格することはありません"},"sso":{"title":"シングルサインオン","external_id":"External ID","external_username":"ユーザ名","external_name":"名前","external_email":"メール","external_avatar_url":"プロフィール画像URL"}},"user_fields":{"title":"ユーザフィールド","help":"ユーザが記入するフィールドを追加します","create":"ユーザフィールド作成","untitled":"無題","name":"フィールド名","type":"フィールドタイプ","description":"フィールド説明","save":"保存","edit":"編集","delete":"削除","cancel":"キャンセル","delete_confirm":"ユーザフィールドを削除してもよいですか？","options":"オプション","required":{"title":"サインアップ時に必須？","enabled":"必須","disabled":"任意"},"editable":{"title":"サインアップ後に編集可能？","enabled":"編集可能","disabled":"編集不可"},"show_on_profile":{"title":"パブリックプロフィールに表示？","enabled":"プロフィールに表示","disabled":"プロフィール非表示"},"field_types":{"text":"テキストフィールド","confirm":"確認","dropdown":"ドロップダウン"}},"site_text":{"none":"コンテンツの種類を選択してください","title":"テキストコンテンツ"},"site_settings":{"show_overriden":"上書き部分のみ表示","title":"設定","reset":"デフォルトに戻す","none":"なし","no_results":"何も見つかりませんでした。","clear_filter":"クリア","add_url":"URL追加","add_host":"ホストを追加","categories":{"all_results":"全て","required":"必須設定","basic":"基本設定","users":"ユーザ","posting":"ポスト","email":"メール","files":"ファイル","trust":"トラストレベル","security":"セキュリティ","onebox":"Onebox","seo":"SEO","spam":"スパム","rate_limits":"投稿制限","developer":"開発者向け","embedding":"埋め込む","legal":"法律に基づく情報","uncategorized":"その他","backups":"バックアップ","login":"ログインする","plugins":"プラグイン"}},"badges":{"title":"バッジ","new_badge":"新しいバッジ","new":"新規","name":"バッジ名","badge":"バッジ","display_name":"バッジの表示名","description":"バッジの説明","badge_type":"バッジの種類","badge_grouping":"グループ","badge_groupings":{"modal_title":"バッジグルーピング"},"granted_by":"バッジ付与者","granted_at":"バッジ付与日","reason_help":"(ポストかトピックへのリンク)","save":"バッジを保存する","delete":"バッジを削除する","delete_confirm":"本当にこのバッジを削除しますか？","revoke":"取り消す","reason":"理由","expand":"\u0026hellipを展開","revoke_confirm":"このバッジを取り消しますか？","edit_badges":"バッジを編集する","grant_badge":"バッジを付ける","granted_badges":"付けられたバッジ","grant":"付ける","no_user_badges":"%{name} はバッジを付けられていません。","no_badges":"付けられるバッジがありません","none_selected":"バッジを選択して開始","allow_title":"バッジは、タイトルとして使用されることを許可する","multiple_grant":"複数回付与することができます","listable":"パブリックパッジページに表示するバッジ","enabled":"バッジシステムを使う","icon":"アイコン","image":"画像","icon_help":"Font Awesomeのクラスか画像のURLを使用してください","query":"バッジクエリ(SQL)","target_posts":"クエリ対象ポスト","auto_revoke":"毎日失効クエリを実行","show_posts":"バッジページの付与したバッジでポストを表示","trigger":"トリガー","trigger_type":{"none":"毎日更新する","post_action":"ユーザがポストに影響を与えたとき","post_revision":"ユーザがポストを作成、編集したとき","trust_level_change":"ユーザのトラストレベルが変わったとき","user_change":"ユーザを作成、編集したとき"},"preview":{"link_text":"付与するバッジをプレビュー","plan_text":"クエリ計画をプレビュー","modal_title":"バッジクエリをプレビュー","sql_error_header":"クエリにエラーがあります","error_help":"バッジクエリのヘルプについては、以下のリンクを参照してください","bad_count_warning":{"header":"WARNING!","text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"sample":"サンプル：","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link} at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"絵文字","help":"Add new emoji that will be available to everyone. (PROTIP: drag \u0026 drop multiple files at once)","add":"新しい絵文字を追加","name":"名前","image":"画像","delete_confirm":"Are you sure you want to delete the :%{name}: emoji?"},"permalink":{"title":"パーマリンク","url":"URL","topic_id":"トピックID","topic_title":"トピック","post_id":"ポストID","post_title":"ポスト","category_id":"カテゴリID","category_title":"カテゴリ","external_url":"外部URL","delete_confirm":"このパーマリンクを削除してもよろしいですか？","form":{"label":"新規:","add":"追加","filter":"検索(URL または 外部URL)"}}},"lightbox":{"download":"ダウンロード"},"search_help":{"title":"Search Help"},"keyboard_shortcuts_help":{"title":"キーボードショートカット","jump_to":{"title":"ページ移動","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e ホーム","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e 最新","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e 新規","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e 未読","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e カテゴリ","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e トップ","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e ブックマーク"},"navigation":{"title":"ナビゲーション","jump":"\u003cb\u003e#\u003c/b\u003e # 投稿へ","back":"\u003cb\u003eu\u003c/b\u003e 戻る","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e トピック・投稿 \u0026uarr; \u0026darr;移動","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e トピックへ","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e 次のセクション/前のセクション"},"application":{"title":"アプリケーション","create":"\u003cb\u003ec\u003c/b\u003e 新しいトピックを作成","notifications":"\u003cb\u003en\u003c/b\u003e お知らせを開く","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e ユーザメニュを開く","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e 更新されたトピックを表示する","search":"\u003cb\u003e/\u003c/b\u003e 検索","help":"\u003cb\u003e?\u003c/b\u003e キーボードヘルプを表示する","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e　新しい投稿を非表示する","dismiss_topics":"Dismiss Topics"},"actions":{"title":"操作","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e トピックのブックマークをトグル","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003eトピックを ピン留め/ピン留め解除","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e トピックをシェア","share_post":"\u003cb\u003es\u003c/b\u003e 投稿をシェアする","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e リンクトピックとして引用返信","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e トピックに返信","reply_post":"\u003cb\u003er\u003c/b\u003e 投稿に返信","quote_post":"\u003cb\u003eq\u003c/b\u003e 投稿を引用する","like":"\u003cb\u003el\u003c/b\u003e 投稿を「いいね！」する","flag":"\u003cb\u003e!\u003c/b\u003e 投稿をフラグする","bookmark":"\u003cb\u003eb\u003c/b\u003e 投稿をブックマークする","edit":"\u003cb\u003ee\u003c/b\u003e 投稿を編集","delete":"\u003cb\u003ed\u003c/b\u003e 投稿を削除する","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e トピックをミュートする","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e 通常トピックにする","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e トピックをトラックする","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e トピックを参加中にする"}},"badges":{"title":"バッジ","allow_title":"タイトルとして使用できる","multiple_grant":"複数回受け取ることができる","badge_count":{"other":"%{count} バッジ"},"more_badges":{"other":"バッジを全て見る（全%{count}個）"},"granted":{"other":"%{count} つバッジを付与されました"},"select_badge_for_title":"タイトルとして使用するバッジを選択","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Getting Started"},"community":{"name":"コミュニティ"},"trust_level":{"name":"トラストレベル"},"other":{"name":"その他"},"posting":{"name":"投稿中"}},"badge":{"editor":{"name":"編集者","description":"最初のポスト編集"},"basic_user":{"name":"ベーシックユーザ","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eGranted\u003c/a\u003e all essential community functions"},"member":{"name":"メンバー","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eGranted\u003c/a\u003e invitations"},"regular":{"name":"レギュラー","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"leader":{"name":"リーダー","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eGranted\u003c/a\u003e global edit, pin, close, archive, split and merge"},"welcome":{"name":"ようこそ","description":"「いいね！」を受けました"},"autobiographer":{"name":"Autobiographer","description":"Filled user \u003ca href=\"/my/preferences\"\u003eprofile\u003c/a\u003e information"},"anniversary":{"name":"アニバーサリー","description":"今年一度でも投稿したアクティブメンバー"},"nice_post":{"name":"良いポスト","description":"10人に「いいね！」をされました。このバッジは何度でももらえます。"},"good_post":{"name":"良い投稿！","description":"25人に「いいね！」をされました。このバッジは何度でももらえます。"},"great_post":{"name":"素晴らしい投稿！","description":"50人に「いいね！」をされました。このバッジは何度でももらえます。"},"nice_topic":{"name":"ナイストピック","description":"トピックが10回「いいね！」されました。このバッジは何度でももらえます"},"good_topic":{"name":"グッドトピック","description":"トピックが25回「いいね！」されました。このバッジは何度でももらえます"},"great_topic":{"name":"グレートトピック","description":"トピックが50回「いいね！」されました。このバッジは何度でももらえます"},"nice_share":{"name":"ナイスシェア","description":"25人の訪問者にポストがシェアされました"},"good_share":{"name":"グッドシェア","description":"300人の訪問者にポストがシェアされました"},"great_share":{"name":"グレートシェア","description":"1000人の訪問者にポストがシェアされました"},"first_like":{"name":"初めての「いいね！」","description":"投稿に「いいね！」した"},"first_flag":{"name":"最初のフラグ","description":"投稿にフラグをつけた"},"promoter":{"name":"プロモーター","description":"招待したユーザ"},"campaigner":{"name":"キャンペイナー","description":"3人のベーシックユーザー(トラストレベル 1)を招待"},"champion":{"name":"チャンピオン","description":"5 メンバー(トラストレベル2)を招待"},"first_share":{"name":"初めてのシェア","description":"投稿をシェアした"},"first_link":{"name":"最初のリンク","description":"サイト内投稿のリンクを挿入した"},"first_quote":{"name":"最初の投稿","description":"ユーザにタグを付けた"},"read_guidelines":{"name":"ガイドラインを読んだ","description":"\u003ca href=\"/guidelines\"\u003ecommunity guidelines\u003c/a\u003eを読みました"},"reader":{"name":"閲覧者","description":"100以上の投稿があるトピック内の投稿をすべて読みました。"}}}}},"en":{"js":{"number":{"human":{"storage_units":{"units":{"byte":{"one":"Byte"}}}}},"dates":{"tiny":{"less_than_x_seconds":{"one":"\u003c 1s"},"x_seconds":{"one":"1s"},"less_than_x_minutes":{"one":"\u003c 1m"},"x_minutes":{"one":"1m"},"about_x_hours":{"one":"1h"},"x_days":{"one":"1d"},"about_x_years":{"one":"1y"},"over_x_years":{"one":"\u003e 1y"},"almost_x_years":{"one":"1y"}},"medium":{"x_minutes":{"one":"1 min"},"x_hours":{"one":"1 hour"},"x_days":{"one":"1 day"}},"medium_with_ago":{"x_minutes":{"one":"1 min ago"},"x_hours":{"one":"1 hour ago"},"x_days":{"one":"1 day ago"}},"later":{"x_days":{"one":"1 day later"},"x_months":{"one":"1 month later"},"x_years":{"one":"1 year later"}}},"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","links_lowercase":{"one":"link"},"character_count":{"one":"{{count}} character"},"topic_count_latest":{"one":"{{count}} new or updated topic."},"topic_count_unread":{"one":"{{count}} unread topic."},"topic_count_new":{"one":"{{count}} new topic."},"uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval"},"approval":{"pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending."}}},"directory":{"total_rows":{"one":"1 user"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","title":{"one":"group"},"trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"},"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}."}},"user":{"expand_profile":"Expand","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","replies_lowercase":{"one":"reply"},"signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"login":{"to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again","selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic."}}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"new_topics":{"one":"1 new topic"},"unread_topics":{"one":"1 unread topic"},"total_unread_posts":{"one":"you have 1 unread post in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"regular":{"title":"Normal"},"regular_pm":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","filters":{"n_posts":{"one":"1 post"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post."}}},"post":{"deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)"},"gap":{"one":"view 1 hidden reply"},"has_replies":{"one":"{{count}} Reply"},"has_likes":{"one":"{{count}} Like"},"has_likes_title":{"one":"1 person liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?"}},"change_owner":"Change Ownership"},"actions":{"defer_flags":{"one":"Defer flag"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post"},"like":{"one":"You and 1 other liked this"},"vote":{"one":"You and 1 other voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post"},"like":{"one":"1 person liked this"},"vote":{"one":"1 person voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?"}}},"category":{"create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_map":{"clicks":{"one":"1 click"}},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"views_lowercase":{"one":"view"},"likes_lowercase":{"one":"like"},"users_lowercase":{"one":"user"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"voters":{"one":"voter"},"total_votes":{"one":"total vote"},"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"flags":{"summary":{"action_type_3":{"one":"off-topic"},"action_type_4":{"one":"inappropriate"},"action_type_6":{"one":"custom"},"action_type_7":{"one":"custom"},"action_type_8":{"one":"spam"}}},"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"embedded_css":"Embedded CSS","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}}},"users":{"approved_selected":{"one":"approve user"},"reject_selected":{"one":"reject user"},"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"},"reject_successful":{"one":"Successfully rejected 1 user."},"reject_failures":{"one":"Failed to reject 1 user."}},"user":{"delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge_count":{"one":"1 Badge"},"more_badges":{"one":"+1 More"},"granted":{"one":"1 granted"},"badge":{"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'ja';
//! moment.js
//! version : 2.8.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {
    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = '2.8.1',
        // the global-scope this is NOT the global object in Node.js
        globalScope = typeof global !== 'undefined' ? global : this,
        oldGlobalMoment,
        round = Math.round,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

        // internal storage for locale config files
        locales = {},

        // extra moment internal properties (plugins register props here)
        momentProperties = [],

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

        // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
        // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
        parseTokenOrdinal = /\d{1,2}/,

        //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
            ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
            ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
            ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
            ['GGGG-[W]WW', /\d{4}-W\d{2}/],
            ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            D : 'date',
            w : 'week',
            W : 'isoWeek',
            M : 'month',
            Q : 'quarter',
            y : 'year',
            DDD : 'dayOfYear',
            e : 'weekday',
            E : 'isoWeekday',
            gg: 'weekYear',
            GG: 'isoWeekYear'
        },

        camelFunctions = {
            dayofyear : 'dayOfYear',
            isoweekday : 'isoWeekday',
            isoweek : 'isoWeek',
            weekyear : 'weekYear',
            isoweekyear : 'isoWeekYear'
        },

        // format function strings
        formatFunctions = {},

        // default relative time thresholds
        relativeTimeThresholds = {
            s: 45,  // seconds to minute
            m: 45,  // minutes to hour
            h: 22,  // hours to day
            d: 26,  // days to month
            M: 11   // months to year
        },

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.localeData().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.localeData().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.localeData().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.localeData().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.localeData().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            YYYYYY : function () {
                var y = this.year(), sign = y >= 0 ? '+' : '-';
                return sign + leftZeroFill(Math.abs(y), 6);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return leftZeroFill(this.weekYear(), 4);
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 4);
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return toInt(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(toInt(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            SSSS : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + ':' + leftZeroFill(toInt(a) % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            },
            Q : function () {
                return this.quarter();
            }
        },

        deprecations = {},

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'];

    // Pick the first defined of two or three arguments. dfl comes from
    // default.
    function dfl(a, b, c) {
        switch (arguments.length) {
            case 2: return a != null ? a : b;
            case 3: return a != null ? a : b != null ? b : c;
            default: throw new Error('Implement me');
        }
    }

    function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
            empty : false,
            unusedTokens : [],
            unusedInput : [],
            overflow : -2,
            charsLeftOver : 0,
            nullInput : false,
            invalidMonth : null,
            invalidFormat : false,
            userInvalidated : false,
            iso: false
        };
    }

    function printMsg(msg) {
        if (moment.suppressDeprecationWarnings === false &&
                typeof console !== 'undefined' && console.warn) {
            console.warn("Deprecation warning: " + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        return extend(function () {
            if (firstTime) {
                printMsg(msg);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            printMsg(msg);
            deprecations[name] = true;
        }
    }

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.localeData().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Locale() {
    }

    // Moment prototype object
    function Moment(config, skipOverflow) {
        if (skipOverflow !== false) {
            checkOverflow(config);
        }
        copyConfig(this, config);
        this._d = new Date(+config._d);
    }

    // Duration Constructor
    function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = moment.localeData();

        this._bubble();
    }

    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }

        if (b.hasOwnProperty('toString')) {
            a.toString = b.toString;
        }

        if (b.hasOwnProperty('valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function copyConfig(to, from) {
        var i, prop, val;

        if (typeof from._isAMomentObject !== 'undefined') {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (typeof from._i !== 'undefined') {
            to._i = from._i;
        }
        if (typeof from._f !== 'undefined') {
            to._f = from._f;
        }
        if (typeof from._l !== 'undefined') {
            to._l = from._l;
        }
        if (typeof from._strict !== 'undefined') {
            to._strict = from._strict;
        }
        if (typeof from._tzm !== 'undefined') {
            to._tzm = from._tzm;
        }
        if (typeof from._isUTC !== 'undefined') {
            to._isUTC = from._isUTC;
        }
        if (typeof from._offset !== 'undefined') {
            to._offset = from._offset;
        }
        if (typeof from._pf !== 'undefined') {
            to._pf = from._pf;
        }
        if (typeof from._locale !== 'undefined') {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (typeof val !== 'undefined') {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        other = makeAs(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, "moment()." + name  + "(period, number) is deprecated. Please use moment()." + name + "(number, period).");
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = moment.duration(val, period);
            addOrSubtractDurationFromMoment(this, dur, direction);
            return this;
        };
    }

    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
            rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            moment.updateOffset(mom, days || months);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return Object.prototype.toString.call(input) === '[object Date]' ||
            input instanceof Date;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        if (units) {
            var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
            units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (inputObject.hasOwnProperty(prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
            count = 7;
            setter = 'day';
        }
        else if (field.indexOf('month') === 0) {
            count = 12;
            setter = 'month';
        }
        else {
            return;
        }

        moment[field] = function (format, index) {
            var i, getter,
                method = moment._locale[field],
                results = [];

            if (typeof format === 'number') {
                index = format;
                format = undefined;
            }

            getter = function (i) {
                var m = moment().utc().set(setter, i);
                return method.call(moment._locale, m, format || '');
            };

            if (index != null) {
                return getter(index);
            }
            else {
                for (i = 0; i < count; i++) {
                    results.push(getter(i));
                }
                return results;
            }
        };
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
            overflow =
                m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
                m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 23 ? HOUR :
                m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }
    }

    function isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0;
            }
        }
        return m._isValid;
    }

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        if (!locales[name] && hasModule) {
            try {
                oldLocale = moment.locale();
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we want to undo that for lazy loaded locales
                moment.locale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function makeAs(input, model) {
        return model._isUTC ? moment(input).zone(model._offset || 0) :
            moment(input).local();
    }

    /************************************
        Locale
    ************************************/


    extend(Locale.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_'),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : 'h:mm A',
            L : 'MM/DD/YYYY',
            LL : 'MMMM D, YYYY',
            LLL : 'MMMM D, YYYY LT',
            LLLL : 'dddd, MMMM D, YYYY LT'
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : 'in %s',
            past : '%s ago',
            s : 'a few seconds',
            m : 'a minute',
            mm : '%d minutes',
            h : 'an hour',
            hh : '%d hours',
            d : 'a day',
            dd : '%d days',
            M : 'a month',
            MM : '%d months',
            y : 'a year',
            yy : '%d years'
        },

        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },

        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace('%d', number);
        },
        _ordinal : '%d',

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        _invalidDate: 'Invalid date',
        invalidDate: function () {
            return this._invalidDate;
        }
    });

    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
            return parseTokenOneDigit;
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
            return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
            return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
            return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
            if (strict) {
                return parseTokenOneDigit;
            }
            /* falls through */
        case 'SS':
            if (strict) {
                return parseTokenTwoDigits;
            }
            /* falls through */
        case 'SSS':
            if (strict) {
                return parseTokenThreeDigits;
            }
            /* falls through */
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return config._locale._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'SSSS':
            return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
            return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
            return parseTokenOneOrTwoDigits;
        case 'Do':
            return parseTokenOrdinal;
        default :
            a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), 'i'));
            return a;
        }
    }

    function timezoneMinutesFromString(string) {
        string = string || '';
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
            tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
            parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // QUARTER
        case 'Q':
            if (input != null) {
                datePartArray[MONTH] = (toInt(input) - 1) * 3;
            }
            break;
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[MONTH] = toInt(input) - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = config._locale.monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[MONTH] = a;
            } else {
                config._pf.invalidMonth = input;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[DATE] = toInt(input);
            }
            break;
        case 'Do' :
            if (input != null) {
                datePartArray[DATE] = toInt(parseInt(input, 10));
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                config._dayOfYear = toInt(input);
            }

            break;
        // YEAR
        case 'YY' :
            datePartArray[YEAR] = moment.parseTwoDigitYear(input);
            break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
            datePartArray[YEAR] = toInt(input);
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = config._locale.isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[HOUR] = toInt(input);
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[MINUTE] = toInt(input);
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[SECOND] = toInt(input);
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
            datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        // WEEKDAY - human
        case 'dd':
        case 'ddd':
        case 'dddd':
            a = config._locale.weekdaysParse(input);
            // if we didn't get a weekday name, mark the date as invalid
            if (a != null) {
                config._w = config._w || {};
                config._w['d'] = a;
            } else {
                config._pf.invalidWeekday = input;
            }
            break;
        // WEEK, WEEK DAY - numeric
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'e':
        case 'E':
            token = token.substr(0, 1);
            /* falls through */
        case 'gggg':
        case 'GGGG':
        case 'GGGGG':
            token = token.substr(0, 2);
            if (input) {
                config._w = config._w || {};
                config._w[token] = toInt(input);
            }
            break;
        case 'gg':
        case 'GG':
            config._w = config._w || {};
            config._w[token] = moment.parseTwoDigitYear(input);
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = dfl(w.GG, config._a[YEAR], weekOfYear(moment(), 1, 4).year);
            week = dfl(w.W, 1);
            weekday = dfl(w.E, 1);
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = dfl(w.gg, config._a[YEAR], weekOfYear(moment(), dow, doy).year);
            week = dfl(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < dow) {
                    ++week;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);

        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromConfig(config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = dfl(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = makeUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
        // Apply timezone offset from input. The actual zone can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() + config._tzm);
        }
    }

    function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
            return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
            normalizedInput.year,
            normalizedInput.month,
            normalizedInput.day,
            normalizedInput.hour,
            normalizedInput.minute,
            normalizedInput.second,
            normalizedInput.millisecond
        ];

        dateFromConfig(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        if (config._f === moment.ISO_8601) {
            parseISO(config);
            return;
        }

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // handle am pm
        if (config._isPm && config._a[HOUR] < 12) {
            config._a[HOUR] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[HOUR] === 12) {
            config._a[HOUR] = 0;
        }

        dateFromConfig(config);
        checkOverflow(config);
    }

    function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        });
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    // date from iso format
    function parseISO(config) {
        var i, l,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be "T" or undefined
                    config._f = isoDates[i][0] + (match[6] || ' ');
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(parseTokenTimezone)) {
                config._f += 'Z';
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function makeDateFromString(config) {
        parseISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            moment.createFromInputFallback(config);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i, matched;
        if (input === undefined) {
            config._d = new Date();
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if ((matched = aspNetJsonRegex.exec(input)) !== null) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromConfig(config);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    function parseWeekday(input, locale) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = locale.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(posNegDuration, withoutSuffix, locale) {
        var duration = moment.duration(posNegDuration).abs(),
            seconds = round(duration.as('s')),
            minutes = round(duration.as('m')),
            hours = round(duration.as('h')),
            days = round(duration.as('d')),
            months = round(duration.as('M')),
            years = round(duration.as('y')),

            args = seconds < relativeTimeThresholds.s && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < relativeTimeThresholds.m && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < relativeTimeThresholds.h && ['hh', hours] ||
                days === 1 && ['d'] ||
                days < relativeTimeThresholds.d && ['dd', days] ||
                months === 1 && ['M'] ||
                months < relativeTimeThresholds.M && ['MM', months] ||
                years === 1 && ['y'] || ['yy', years];

        args[2] = withoutSuffix;
        args[3] = +posNegDuration > 0;
        args[4] = locale;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add(daysToDayOfWeek, 'd');
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        d = d === 0 ? 7 : d;
        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year: dayOfYear > 0 ? year : year - 1,
            dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || moment.localeData(config._l);

        if (input === null || (format === undefined && input === '')) {
            return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (moment.isMoment(input)) {
            return new Moment(input, true);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = locale;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
    };

    moment.suppressDeprecationWarnings = false;

    moment.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i);
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return moment();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    moment.min = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    };

    moment.max = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    };

    // creating with utc
    moment.utc = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            parseIso,
            diffRes;

        if (moment.isDuration(input)) {
            duration = {
                ms: input._milliseconds,
                d: input._days,
                M: input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y: 0,
                d: toInt(match[DATE]) * sign,
                h: toInt(match[HOUR]) * sign,
                m: toInt(match[MINUTE]) * sign,
                s: toInt(match[SECOND]) * sign,
                ms: toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoDurationRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            parseIso = function (inp) {
                // We'd normally use ~~inp for this, but unfortunately it also
                // converts floats to ints.
                // inp may be undefined, so careful calling replace on it.
                var res = inp && parseFloat(inp.replace(',', '.'));
                // apply sign while we're at it
                return (isNaN(res) ? 0 : res) * sign;
            };
            duration = {
                y: parseIso(match[2]),
                M: parseIso(match[3]),
                d: parseIso(match[4]),
                h: parseIso(match[5]),
                m: parseIso(match[6]),
                s: parseIso(match[7]),
                w: parseIso(match[8])
            };
        } else if (typeof duration === 'object' &&
                ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(moment(duration.from), moment(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && input.hasOwnProperty('_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // constant that refers to the ISO standard
    moment.ISO_8601 = function () {};

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    moment.momentProperties = momentProperties;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function allows you to set a threshold for relative time strings
    moment.relativeTimeThreshold = function (threshold, limit) {
        if (relativeTimeThresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return relativeTimeThresholds[threshold];
        }
        relativeTimeThresholds[threshold] = limit;
        return true;
    };

    moment.lang = deprecate(
        "moment.lang is deprecated. Use moment.locale instead.",
        function (key, value) {
            return moment.locale(key, value);
        }
    );

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    moment.locale = function (key, values) {
        var data;
        if (key) {
            if (typeof(values) !== "undefined") {
                data = moment.defineLocale(key, values);
            }
            else {
                data = moment.localeData(key);
            }

            if (data) {
                moment.duration._locale = moment._locale = data;
            }
        }

        return moment._locale._abbr;
    };

    moment.defineLocale = function (name, values) {
        if (values !== null) {
            values.abbr = name;
            if (!locales[name]) {
                locales[name] = new Locale();
            }
            locales[name].set(values);

            // backwards compat for now: also set the locale
            moment.locale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    };

    moment.langData = deprecate(
        "moment.langData is deprecated. Use moment.localeData instead.",
        function (key) {
            return moment.localeData(key);
        }
    );

    // returns locale data
    moment.localeData = function (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return moment._locale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment ||
            (obj != null &&  obj.hasOwnProperty('_isAMomentObject'));
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };

    for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
    }

    moment.normalizeUnits = function (units) {
        return normalizeUnits(units);
    };

    moment.invalid = function (flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    };

    moment.parseZone = function () {
        return moment.apply(null, arguments).parseZone();
    };

    moment.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.clone().locale('en').format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            var m = moment(this).utc();
            if (0 < m.year() && m.year() <= 9999) {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            } else {
                return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            return isValid(this);
        },

        isDSTShifted : function () {
            if (this._a) {
                return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
            }

            return false;
        },

        parsingFlags : function () {
            return extend({}, this._pf);
        },

        invalidAt: function () {
            return this._pf.overflow;
        },

        utc : function (keepLocalTime) {
            return this.zone(0, keepLocalTime);
        },

        local : function (keepLocalTime) {
            if (this._isUTC) {
                this.zone(0, keepLocalTime);
                this._isUTC = false;

                if (keepLocalTime) {
                    this.add(this._d.getTimezoneOffset(), 'm');
                }
            }
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.localeData().postformat(output);
        },

        add : createAdder(1, 'add'),

        subtract : createAdder(-1, 'subtract'),

        diff : function (input, units, asFloat) {
            var that = makeAs(input, this),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function (time) {
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're zone'd or not.
            var now = time || moment(),
                sod = makeAs(now, this).startOf('day'),
                diff = this.diff(sod, 'days', true),
                format = diff < -6 ? 'sameElse' :
                    diff < -1 ? 'lastWeek' :
                    diff < 0 ? 'lastDay' :
                    diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                    diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.localeData().calendar(format, this));
        },

        isLeapYear : function () {
            return isLeapYear(this.year());
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.localeData());
                return this.add(input - day, 'd');
            } else {
                return day;
            }
        },

        month : makeAccessor('Month', true),

        startOf : function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoWeek') {
                this.isoWeekday(1);
            }

            // quarters are also special
            if (units === 'quarter') {
                this.month(Math.floor(this.month() / 3) * 3);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = units || 'ms';
            return +this.clone().startOf(units) === +makeAs(input, this).startOf(units);
        },

        min: deprecate(
                 'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
                 function (other) {
                     other = moment.apply(null, arguments);
                     return other < this ? this : other;
                 }
         ),

        max: deprecate(
                'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
                function (other) {
                    other = moment.apply(null, arguments);
                    return other > this ? this : other;
                }
        ),

        // keepLocalTime = true means only change the timezone, without
        // affecting the local hour. So 5:31:26 +0300 --[zone(2, true)]-->
        // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist int zone
        // +0200, so we adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        zone : function (input, keepLocalTime) {
            var offset = this._offset || 0,
                localAdjust;
            if (input != null) {
                if (typeof input === 'string') {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                if (!this._isUTC && keepLocalTime) {
                    localAdjust = this._d.getTimezoneOffset();
                }
                this._offset = input;
                this._isUTC = true;
                if (localAdjust != null) {
                    this.subtract(localAdjust, 'm');
                }
                if (offset !== input) {
                    if (!keepLocalTime || this._changeInProgress) {
                        addOrSubtractDurationFromMoment(this,
                                moment.duration(offset - input, 'm'), 1, false);
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        moment.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? 'UTC' : '';
        },

        zoneName : function () {
            return this._isUTC ? 'Coordinated Universal Time' : '';
        },

        parseZone : function () {
            if (this._tzm) {
                this.zone(this._tzm);
            } else if (typeof this._i === 'string') {
                this.zone(this._i);
            }
            return this;
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
        },

        quarter : function (input) {
            return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        week : function (input) {
            var week = this.localeData().week(this);
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        weekday : function (input) {
            var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
            return input == null ? weekday : this.add(input - weekday, 'd');
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function () {
            return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function () {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            if (typeof this[units] === 'function') {
                this[units](value);
            }
            return this;
        },

        // If passed a locale key, it will set the locale for this
        // instance.  Otherwise, it will return the locale configuration
        // variables for this instance.
        locale : function (key) {
            if (key === undefined) {
                return this._locale._abbr;
            } else {
                this._locale = moment.localeData(key);
                return this;
            }
        },

        lang : deprecate(
            "moment().lang() is deprecated. Use moment().localeData() instead.",
            function (key) {
                if (key === undefined) {
                    return this.localeData();
                } else {
                    this._locale = moment.localeData(key);
                    return this;
                }
            }
        ),

        localeData : function () {
            return this._locale;
        }
    });

    function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(),
                daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function rawGetter(mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
            return rawMonthSetter(mom, value);
        } else {
            return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    function makeAccessor(unit, keepTime) {
        return function (value) {
            if (value != null) {
                rawSetter(this, unit, value);
                moment.updateOffset(this, keepTime);
                return this;
            } else {
                return rawGetter(this, unit);
            }
        };
    }

    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    // moment.fn.month is defined separately
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate('dates accessor is deprecated. Use date instead.', makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate('years accessor is deprecated. Use year instead.', makeAccessor('FullYear', true));

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    function daysToYears (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        return days * 400 / 146097;
    }

    function yearsToDays (years) {
        // years * 365 + absRound(years / 4) -
        //     absRound(years / 100) + absRound(years / 400);
        return years * 146097 / 400;
    }

    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years = 0;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);

            // Accurately convert days to years, assume start from year 0.
            years = absRound(daysToYears(days));
            days -= absRound(yearsToDays(years));

            // 30 days to a month
            // TODO (iskren): Use anchor date (like 1st Jan) to compute this.
            months += absRound(days / 30);
            days %= 30;

            // 12 months -> 1 year
            years += absRound(months / 12);
            months %= 12;

            data.days = days;
            data.months = months;
            data.years = years;
        },

        abs : function () {
            this._milliseconds = Math.abs(this._milliseconds);
            this._days = Math.abs(this._days);
            this._months = Math.abs(this._months);

            this._data.milliseconds = Math.abs(this._data.milliseconds);
            this._data.seconds = Math.abs(this._data.seconds);
            this._data.minutes = Math.abs(this._data.minutes);
            this._data.hours = Math.abs(this._data.hours);
            this._data.months = Math.abs(this._data.months);
            this._data.years = Math.abs(this._data.years);

            return this;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var output = relativeTime(this, !withSuffix, this.localeData());

            if (withSuffix) {
                output = this.localeData().pastFuture(+this, output);
            }

            return this.localeData().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            var days, months;
            units = normalizeUnits(units);

            days = this._days + this._milliseconds / 864e5;
            if (units === 'month' || units === 'year') {
                months = this._months + daysToYears(days) * 12;
                return units === 'month' ? months : months / 12;
            } else {
                days += yearsToDays(this._months / 12);
                switch (units) {
                    case 'week': return days / 7;
                    case 'day': return days;
                    case 'hour': return days * 24;
                    case 'minute': return days * 24 * 60;
                    case 'second': return days * 24 * 60 * 60;
                    case 'millisecond': return days * 24 * 60 * 60 * 1000;
                    default: throw new Error('Unknown unit ' + units);
                }
            }
        },

        lang : moment.fn.lang,
        locale : moment.fn.locale,

        toIsoString : deprecate(
            "toIsoString() is deprecated. Please use toISOString() instead " +
            "(notice the capitals)",
            function () {
                return this.toISOString();
            }
        ),

        toISOString : function () {
            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            var years = Math.abs(this.years()),
                months = Math.abs(this.months()),
                days = Math.abs(this.days()),
                hours = Math.abs(this.hours()),
                minutes = Math.abs(this.minutes()),
                seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

            if (!this.asSeconds()) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            return (this.asSeconds() < 0 ? '-' : '') +
                'P' +
                (years ? years + 'Y' : '') +
                (months ? months + 'M' : '') +
                (days ? days + 'D' : '') +
                ((hours || minutes || seconds) ? 'T' : '') +
                (hours ? hours + 'H' : '') +
                (minutes ? minutes + 'M' : '') +
                (seconds ? seconds + 'S' : '');
        },

        localeData : function () {
            return this._locale;
        }
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationGetter(i.toLowerCase());
        }
    }

    moment.duration.fn.asMilliseconds = function () {
        return this.as('ms');
    };
    moment.duration.fn.asSeconds = function () {
        return this.as('s');
    };
    moment.duration.fn.asMinutes = function () {
        return this.as('m');
    };
    moment.duration.fn.asHours = function () {
        return this.as('h');
    };
    moment.duration.fn.asDays = function () {
        return this.as('d');
    };
    moment.duration.fn.asWeeks = function () {
        return this.as('weeks');
    };
    moment.duration.fn.asMonths = function () {
        return this.as('M');
    };
    moment.duration.fn.asYears = function () {
        return this.as('y');
    };

    /************************************
        Default Locale
    ************************************/


    // Set default locale, other locale will inherit from English.
    moment.locale('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LOCALES */

    /************************************
        Exposing Moment
    ************************************/

    function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
            return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
            globalScope.moment = deprecate(
                    'Accessing Moment through the global scope is ' +
                    'deprecated, and will be removed in an upcoming ' +
                    'release.',
                    moment);
        } else {
            globalScope.moment = moment;
        }
    }

    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    } else if (typeof define === 'function' && define.amd) {
        define('moment', function (require, exports, module) {
            if (module.config && module.config() && module.config().noGlobal === true) {
                // release the global variable
                globalScope.moment = oldGlobalMoment;
            }

            return moment;
        });
        makeGlobal(true);
    } else {
        makeGlobal();
    }
}).call(this);
// moment.js locale configuration
// locale : japanese (ja)
// author : LI Long : https://github.com/baryon

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    return moment.defineLocale('ja', {
        months : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        weekdays : "日曜日_月曜日_火曜日_水曜日_木曜日_金曜日_土曜日".split("_"),
        weekdaysShort : "日_月_火_水_木_金_土".split("_"),
        weekdaysMin : "日_月_火_水_木_金_土".split("_"),
        longDateFormat : {
            LT : "Ah時m分",
            L : "YYYY/MM/DD",
            LL : "YYYY年M月D日",
            LLL : "YYYY年M月D日LT",
            LLLL : "YYYY年M月D日LT dddd"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 12) {
                return "午前";
            } else {
                return "午後";
            }
        },
        calendar : {
            sameDay : '[今日] LT',
            nextDay : '[明日] LT',
            nextWeek : '[来週]dddd LT',
            lastDay : '[昨日] LT',
            lastWeek : '[前週]dddd LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s後",
            past : "%s前",
            s : "数秒",
            m : "1分",
            mm : "%d分",
            h : "1時間",
            hh : "%d時間",
            d : "1日",
            dd : "%d日",
            M : "1ヶ月",
            MM : "%dヶ月",
            y : "1年",
            yy : "%d年"
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('MMM D'); };
moment.fn.shortDate = function(){ return this.format('MMM D, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};

I18n.pluralizationRules['ja'] = function (n) {
  return n === 0 ? ["zero", "none", "other"] : "other";
};
