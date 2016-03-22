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
MessageFormat.locale.zh_CN = function ( n ) {
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
r += "还有 ";
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
r += "<a href='/unread'>1 个未读主题</a>";
return r;
},
"other" : function(d){
var r = "";
r += "<a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " 个未读主题</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["zh_CN"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "和 ";
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
r += " <a href='/new'>1 个新</a>主题";
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
r += "和 ";
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
r += " <a href='/new'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " 个新</a>主题";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["zh_CN"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += "可以阅读，或者";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "浏览";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
r += d["catLink"];
r += "中的其他主题";
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
r += "这个主题有 ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " 个帖子";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["zh_CN"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "ratio";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"low" : function(d){
var r = "";
r += "，有很多人赞了该帖";
return r;
},
"med" : function(d){
var r = "";
r += "，有非常多人赞了该帖";
return r;
},
"high" : function(d){
var r = "";
r += "，大多数人赞了该帖";
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
}});I18n.translations = {"zh_CN":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"other":"字节"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}K","millions":"{{number}}M"}},"dates":{"time":"ah:mm","long_no_year":"MMMDoah:mm","long_no_year_no_time":"MMMDo","full_no_year_no_time":"MMMDo","long_with_year":"lll","long_with_year_no_time":"ll","full_with_year_no_time":"YYYY年MMMDo","long_date_with_year":"YY年MMMDoLT","long_date_without_year":"MMMDoLT","long_date_with_year_without_time":"YY年MMMDo","long_date_without_year_with_linebreak":"MMMDo\u003cbr/\u003eLT","long_date_with_year_with_linebreak":"YY年MMMDo\u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1 分钟","less_than_x_seconds":{"other":"\u003c %{count}秒钟"},"x_seconds":{"other":"%{count}秒钟前"},"less_than_x_minutes":{"other":"\u003c %{count}分钟"},"x_minutes":{"other":"%{count}分钟前"},"about_x_hours":{"other":"%{count}小时前"},"x_days":{"other":"%{count}日前"},"about_x_years":{"other":"约%{count}年前"},"over_x_years":{"other":"\u003e %{count}年"},"almost_x_years":{"other":"近%{count}年"},"date_month":"MMMDo","date_year":"YY-MM-D"},"medium":{"x_minutes":{"other":"%{count}分钟"},"x_hours":{"other":"%{count}小时"},"x_days":{"other":"%{count}日"},"date_year":"YY年MMMDo"},"medium_with_ago":{"x_minutes":{"other":"%{count}分钟前"},"x_hours":{"other":"%{count}小时前"},"x_days":{"other":"%{count}日前"}},"later":{"x_days":{"other":"%{count}天后"},"x_months":{"other":"%{count}月后"},"x_years":{"other":"%{count}年后"}}},"share":{"topic":"分享本主题的链接","post":"#%{postNumber} 楼","close":"关闭","twitter":"分享这个链接到 Twitter","facebook":"分享这个链接到 Facebook","google+":"分享这个链接到 Google+","email":"用电子邮件发送这个链接"},"action_codes":{"split_topic":"于%{when}分割了该主题","autoclosed":{"enabled":"于%{when}关闭","disabled":"于%{when}开启"},"closed":{"enabled":"于%{when}关闭","disabled":"于%{when}开启"},"archived":{"enabled":"于%{when}存档","disabled":"于%{when}解除存档"},"pinned":{"enabled":"于%{when}置顶","disabled":"于%{when}解除置顶"},"pinned_globally":{"enabled":"于%{when}全局置顶","disabled":"于%{when}解除全局置顶"},"visible":{"enabled":"于%{when}置于列表中","disabled":"于%{when}移除出列表"}},"topic_admin_menu":"主题管理操作","emails_are_disabled":"所有的出站邮件已经被管理员全局禁用。将不发送任何邮件提醒。","edit":"编辑本主题的标题和分类","not_implemented":"非常抱歉，此功能暂时尚未实现！","no_value":"否","yes_value":"是","generic_error":"抱歉，发生了一个错误。","generic_error_with_reason":"发生了一个错误：%{error}","sign_up":"注册","log_in":"登录","age":"年龄","joined":"加入时间：","admin_title":"管理","flags_title":"标记","show_more":"显示更多","show_help":"选项","links":"链接","links_lowercase":{"other":"链接"},"faq":"常见问题（FAQ）","guidelines":"指引","privacy_policy":"隐私政策","privacy":"隐私","terms_of_service":"服务条款","mobile_view":"移动版","desktop_view":"桌面版","you":"你","or":"或","now":"刚刚","read_more":"阅读更多","more":"更多","less":"更少","never":"从未","daily":"每天","weekly":"每周","every_two_weeks":"每两周","every_three_days":"每三天","max_of_count":"最多 {{count}}","alternation":"或","character_count":{"other":"%{count} 个字符"},"suggested_topics":{"title":"推荐主题"},"about":{"simple_title":"关于","title":"关于%{title}","stats":"站点统计","our_admins":"我们的管理员们","our_moderators":"我们的版主们","stat":{"all_time":"所有时间内","last_7_days":"7 天以内","last_30_days":"30 天以内"},"like_count":"赞","topic_count":"主题","post_count":"帖子","user_count":"新用户","active_user_count":"活跃用户","contact":"联系我们","contact_info":"在遇到影响站点的重大错误或者紧急事件时，请通过 %{contact_info} 联系我们。"},"bookmarked":{"title":"书签","clear_bookmarks":"删除书签","help":{"bookmark":"点击收藏该主题的第一个帖子","unbookmark":"点击删除本主题的所以书签"}},"bookmarks":{"not_logged_in":"抱歉，你需要先登录才能给帖子加书签","created":"你已经为此贴添加书签","not_bookmarked":"你已经阅读过此帖；点此为其添加书签","last_read":"这是你阅读过的最后一帖；点此给它加上书签","remove":"删除书签","confirm_clear":"你确定要删除该主题的所有书签吗？"},"topic_count_latest":{"other":"{{count}} 个新主题或更新的主题。"},"topic_count_unread":{"other":"{{count}} 未读主题。"},"topic_count_new":{"other":"近期有 {{count}} 个主题。"},"click_to_show":"点此显示。","preview":"预览","cancel":"取消","save":"保存修改","saving":"保存中...","saved":"已保存！","upload":"上传","uploading":"上传中...","uploading_filename":"上传“{{filename}}”中……","uploaded":"上传完成！","enable":"启用","disable":"禁用","undo":"重做","revert":"撤销","failed":"失败","switch_to_anon":"匿名模式","switch_from_anon":"退出匿名模式","banner":{"close":"隐藏横幅。","edit":"编辑横幅\u003e\u003e"},"choose_topic":{"none_found":"没有找到主题。","title":{"search":"通过名称、URL 或者 ID，搜索主题：","placeholder":"在此输入主题标题"}},"queue":{"topic":"主题：","approve":"通过","reject":"否决","delete_user":"删除用户","title":"需要审核","none":"没有帖子可以审核。","edit":"编辑","cancel":"取消","view_pending":"查看待审核帖子","has_pending_posts":{"other":"这个主题有 \u003cb\u003e{{count}}\u003c/b\u003e 个帖子等待审核"},"confirm":"保存修改","delete_prompt":"你确定要删除\u003cb\u003e%{username}\u003c/b\u003e？这将删除他们的所有帖子并封禁这个邮箱和 IP 地址。","approval":{"title":"帖子需要审核","description":"我们已经保存了你的帖子，不过帖子需要由管理员先审核才能显示。请耐心。","pending_posts":{"other":"你有 \u003cstrong\u003e{{count}}\u003c/strong\u003e 个帖子待审核。"},"ok":"确认"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 发起了 \u003ca href='{{topicUrl}}'\u003e本主题\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 发起了 \u003ca href='{{topicUrl}}'\u003e本主题\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 回复了 \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 回复了 \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 回复了 \u003ca href='{{topicUrl}}'\u003e本主题\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 回复了 \u003ca href='{{topicUrl}}'\u003e本主题\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e你\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003e你\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"发起人 \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"发起人 \u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e","sent_by_user":"发送人 \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"发送人 \u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e"},"directory":{"filter_name":"按用户名过滤","title":"用户","likes_given":"赞","likes_received":"被赞","topics_entered":"浏览","topics_entered_long":"浏览过的主题","time_read":"阅读时间","topic_count":"主题","topic_count_long":"创建的主题","post_count":"回复","post_count_long":"回复帖子数量","no_results":"没有找到结果。","days_visited":"访问","days_visited_long":"访问天数","posts_read":"阅读","posts_read_long":"阅读过的帖子","total_rows":{"other":"%{count} 位用户"}},"groups":{"add":"添加","selector_placeholder":"添加成员","owner":"所有者","visible":"群组对所有用户可见","title":{"other":"群组"},"members":"成员","posts":"帖子","alias_levels":{"title":"谁能把组名作为别名？","nobody":"无人","only_admins":"仅管理员","mods_and_admins":"仅版主与管理员","members_mods_and_admins":"仅组员、版主与管理员","everyone":"任何人"},"trust_levels":{"title":"当这些用户加入时，信任等级将自动赋予给他们：","none":"无"}},"user_action_groups":{"1":"给赞","2":"被赞","3":"书签","4":"主题","5":"回复","6":"回应","7":"提到","9":"引用","10":"星标","11":"编辑","12":"发送条目","13":"收件箱","14":"待定"},"categories":{"all":"所有分类","all_subcategories":"全部","no_subcategory":"无","category":"分类","reorder":{"title":"重排序分类","title_long":"重新排序分类列表","fix_order":"固定位置","fix_order_tooltip":"不是所有的分类都有不同的位置数字，这可能导致一些问题。","save":"保存顺序","apply_all":"应用","position":"位置"},"posts":"新帖子","topics":"近期","latest":"最新","latest_by":"最新发表：","toggle_ordering":"排序控制","subcategories":"子分类","topic_stats":"近期主题的数量。","topic_stat_sentence":{"other":"在过去一%{unit}中有 %{count} 个新主题。"},"post_stats":"新帖子的数量。","post_stat_sentence":{"other":"在过去一%{unit}中有 %{count} 个新帖子。"}},"ip_lookup":{"title":"IP 地址查询","hostname":"主机名","location":"位置","location_not_found":"(未知)","organisation":"组织","phone":"电话","other_accounts":"其他使用该 IP 地址的账户：","delete_other_accounts":"删除 %{count}","username":"用户名","trust_level":"信任等级","read_time":"阅读时间","topics_entered":"进入的主题","post_count":"# 帖子","confirm_delete_other_accounts":"你确定你想要删除这些账户吗？"},"user_fields":{"none":"（选择一个选项）"},"user":{"said":"{{username}}：","profile":"个人资料","mute":"防打扰","edit":"修改设置","download_archive":"下载我的帖子","new_private_message":"新消息","private_message":"消息","private_messages":"消息","activity_stream":"活动","preferences":"设置","expand_profile":"展开","bookmarks":"书签","bio":"关于我","invited_by":"邀请者为","trust_level":"用户级别","notifications":"通知","desktop_notifications":{"label":"桌面通知","not_supported":"通知功能暂不支持该浏览器。抱歉。","perm_default":"启用通知","perm_denied_btn":"拒绝授权","perm_denied_expl":"你拒绝了通知权限。在你的浏览器中允许启用通知，然后再点击按钮。（桌面：点击最左边的图标。移动设备：“站点设置”。）","disable":"禁用通知","currently_enabled":"（目前已启用）","enable":"启用通知","currently_disabled":"（目前已禁用）","each_browser_note":"注意：你必须在任何你使用的浏览器中更改这项设置。"},"dismiss_notifications":"标记所有为已读","dismiss_notifications_tooltip":"标记所有未读通知为已读","disable_jump_reply":"不要在回复后跳转到我的新帖子","dynamic_favicon":"在浏览器图标上显示新/更新的主题数量","edit_history_public":"让其他用户查看我的帖子的以前版本","external_links_in_new_tab":"始终在新的标签页打开外部链接","enable_quoting":"在高亮选择文字时启用引用回复","change":"修改","moderator":"{{user}} 是版主","admin":"{{user}} 是管理员","moderator_tooltip":"用户是版主","admin_tooltip":"用户是管理员","blocked_tooltip":"这个用户已被封禁","suspended_notice":"该用户将被禁止登录，直至 {{date}}。","suspended_reason":"原因：","github_profile":"Github","mailing_list_mode":"每有一个新帖就发送一封邮件给我（除非我屏蔽了主题或者分类）","watched_categories":"已关注","watched_categories_instructions":"你将会自动监视这些分类中的所有新主题。你会收到新帖子或新主题的通知，并且新帖数量也将在每个主题后显示。","tracked_categories":"已追踪","tracked_categories_instructions":"你将会自动追踪这些分类中的所有新主题。新帖数量将在每个主题后显示。","muted_categories":"已屏蔽","muted_categories_instructions":"你不会收到这些分类中的任何新主题通知，并且他们将不会出现在最新列表中。","delete_account":"删除我的帐号","delete_account_confirm":"你真的要永久删除自己的账号吗？删除之后无法恢复！","deleted_yourself":"你的帐号已被成功删除。","delete_yourself_not_allowed":"你目前不能删除自己的帐号。联系管理员帮助你删除帐号。","unread_message_count":"消息","admin_delete":"删除","users":"用户","muted_users":"忽略","muted_users_instructions":"禁止任何关于这些用户的通知。","muted_topics_link":"显示已忽略的主题","automatically_unpin_topics":"当你到达底部时自动解除主题置顶。","staff_counters":{"flags_given":"有效标记","flagged_posts":"被报告的帖子","deleted_posts":"删除的帖子","suspensions":"禁用的","warnings_received":"警告"},"messages":{"all":"所有","mine":"我的","unread":"未读"},"change_password":{"success":"（电子邮件已发送）","in_progress":"（正在发送电子邮件）","error":"（错误）","action":"发送密码重置邮件","set_password":"设置密码"},"change_about":{"title":"更改个人简介","error":"改变该值时出现错误。"},"change_username":{"title":"修改用户名","confirm":"如果你修改用户名，所有引用你的帖子和 @你 的链接将失效。你真的确定要这么做么？","taken":"抱歉，此用户名已经被使用了。","error":"在修改你的用户名时发生了错误。","invalid":"此用户名不合法，用户名只能包含字母和数字"},"change_email":{"title":"修改电子邮箱","taken":"抱歉，此电子邮箱不可用。","error":"抱歉在修改你的电子邮箱时发生了错误，可能此邮箱已经被使用了？","success":"我们已经发送了一封确认信到此邮箱地址，请按照邮箱内指示完成确认。"},"change_avatar":{"title":"更改你的头像","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e头像，基于：","gravatar_title":"在 Gravatar 网站上更改你的头像","refresh_gravatar_title":"刷新你的头像","letter_based":"系统分配的头像","uploaded_avatar":"自定义图片","uploaded_avatar_empty":"添加自定义图片","upload_title":"上传图片","upload_picture":"上传图片","image_is_not_a_square":"注意：我们已经裁剪了你的图片；它不是正方形的。","cache_notice":"你已经成功地改变了你的个人头像，但是鉴于浏览器缓存可能要一段时间才能生效。"},"change_profile_background":{"title":"个人资料背景","instructions":"个人资料背景将被居中，且默认宽度为 850px。"},"change_card_background":{"title":"用户资料背景","instructions":"背景图片将被居中并且默认宽度为 590px。"},"email":{"title":"电子邮箱","instructions":"绝不会被公开显示","ok":"我们将邮件跟你确认","invalid":"请填写正确的电子邮箱地址","authenticated":"你的电子邮箱已经被 {{provider}} 验证了。","frequency_immediately":"如果你没有阅读过我们想寄给你的内容，我们会立即发送电子邮件给你。","frequency":{"other":"我们只会在你最近 {{count}} 分钟内没有访问时才会发送电子邮件给你。"}},"name":{"title":"名字","instructions":"你的全名（可选）","instructions_required":"你的全名","too_short":"你设置的名字太短了","ok":"你的名字符合要求"},"username":{"title":"用户名","instructions":"唯一，没有空格，简短","short_instructions":"其他人可以用 @{{username}} 来提及你","available":"你的用户名可用","global_match":"电子邮箱与注册用户名相匹配","global_mismatch":"已被注册。试试 {{suggestion}} ？","not_available":"不可用。试试 {{suggestion}} ？","too_short":"你设置的用户名太短了","too_long":"你设置的用户名太长了","checking":"查看用户名是否可用...","enter_email":"找到用户名；请输入对应电子邮箱","prefilled":"电子邮箱与注册用户名匹配"},"locale":{"title":"界面语言","instructions":"用户界面语言。将在你刷新页面后改变。","default":"（默认）"},"password_confirmation":{"title":"请再次输入密码"},"last_posted":"最后一帖","last_emailed":"最后一次邮寄","last_seen":"最后一次活动","created":"加入时间","log_out":"登出","location":"地址","card_badge":{"title":"用户资料徽章"},"website":"网站","email_settings":"电子邮箱","email_digests":{"title":"当我不访问时，向我的邮箱发送最新信息：","daily":"每天","every_three_days":"每三天","weekly":"每周","every_two_weeks":"每两周"},"email_direct":"当有人引用我、回复我的帖子，@提及你或邀请你至主题时发送一封邮件给我","email_private_messages":"当有人给发消息给我时发送一封邮件给我","email_always":"即使我在论坛中活跃时也发送电子邮件提醒给我","other_settings":"其它","categories_settings":"分类","new_topic_duration":{"label":"近期主题的条件：","not_viewed":"我还没有浏览它们","last_here":"在你最近一次访问之后创建的","after_1_day":"在昨天创建","after_2_days":"在这 2 天创建","after_1_week":"在上周创建","after_2_weeks":"在这 2 周创建"},"auto_track_topics":"自动追踪我进入的主题","auto_track_options":{"never":"从不","immediately":"立刻","after_30_seconds":"30 秒之后","after_1_minute":"1 分钟之后","after_2_minutes":"2 分钟之后","after_3_minutes":"3 分钟之后","after_4_minutes":"4 分钟之后","after_5_minutes":"5 分钟之后","after_10_minutes":"10 分钟之后"},"invited":{"search":"输入以搜索邀请...","title":"邀请","user":"邀请用户","sent":"已发送","none":"没有未接受状态的邀请。","truncated":{"other":"只显示前·{{count}}个邀请。"},"redeemed":"确认邀请","redeemed_tab":"已确认","redeemed_tab_with_count":"已确认（{{count}}）","redeemed_at":"已确认","pending":"待验证邀请","pending_tab":"等待中","pending_tab_with_count":"等待确认（{{count}}）","topics_entered":"已查看的主题","posts_read_count":"已读的帖子","expired":"该邀请已过期。","rescind":"移除","rescinded":"邀请已删除","reinvite":"重新发送邀请","reinvited":"邀请已重新发送","time_read":"阅读时间","days_visited":"访问天数","account_age_days":"账号建立天数","create":"发送邀请","generate_link":"复制邀请链接","generated_link_message":"\u003cp\u003e邀请链接成功生成！\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003e邀请链接仅对下列邮件地址有效：\u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"你没有邀请过任何人。你可以发送个人邀请，或者\u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003e上传一个批量邀请文件\u003c/a\u003e一次性邀请一批人。","text":"通过文件批量邀请","uploading":"上传中……","success":"文件成功上传，当操作完成后你将收到消息通知。","error":"在上传 '{{filename}}' 时出现错误：{{message}}"}},"password":{"title":"密码","too_short":"你设置的密码太短了。","common":"你设置的密码太常见了。","same_as_username":"你的密码与用户名相同。","same_as_email":"你的密码与电子邮箱相同。","ok":"你设置的密码符合要求。","instructions":"至少需要 %{count} 个字符。"},"associated_accounts":"登录","ip_address":{"title":"最后使用的 IP 地址"},"registration_ip_address":{"title":"注册 IP 地址"},"avatar":{"title":"头像","header_title":"个人页面、消息、书签和设置"},"title":{"title":"头衔"},"filters":{"all":"全部"},"stream":{"posted_by":"发送人","sent_by":"发送时间","private_message":"消息","the_topic":"本主题"}},"loading":"载入中...","errors":{"prev_page":"无法载入","reasons":{"network":"网络错误","server":"服务器错误","forbidden":"访问被阻止","unknown":"错误","not_found":"没有找到网页"},"desc":{"network":"请检查你的网络连接。","network_fixed":"似乎恢复正常了。","server":"错误代码：{{status}}","forbidden":"你没有权限读这个。","not_found":"噢！程式要加载的URL并不存在。","unknown":"出错了。"},"buttons":{"back":"返回","again":"再试一次","fixed":"载入页面"}},"close":"关闭","assets_changed_confirm":"此网页刚刚更新. 刷新查看新版本?","logout":"你已登出。","refresh":"刷新","read_only_mode":{"enabled":"只读模式已启用。你可以继续浏览这个站点但是无法进行交互操作。","login_disabled":"只读模式下不允许登录。"},"too_few_topics_and_posts_notice":"让我们\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003e开始讨论！\u003c/a\u003e目前有 \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e 个主题和 \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e 个帖子。新访客需要能够阅读和回复一些讨论。","too_few_topics_notice":"让我们\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003e开始讨论！\u003c/a\u003e目前有 \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e 个主题。新访客需要能够阅读和回复一些讨论。","too_few_posts_notice":"让我们\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003e开始讨论！\u003c/a\u003e目前有 \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e 个帖子。新访客需要能够阅读和回复一些讨论。","learn_more":"了解更多...","year":"年","year_desc":"365 天以前创建的主题","month":"月","month_desc":"30 天以前创建的主题","week":"周","week_desc":"7 天以前创建的主题","day":"天","first_post":"第一帖","mute":"防打扰","unmute":"解除防打扰","last_post":"最后一帖","last_reply_lowercase":"最后回复","replies_lowercase":{"other":"回复"},"signup_cta":{"sign_up":"注册","hide_session":"明天提醒我","hide_forever":"不了","hidden_for_session":"好的，我会在明天提醒你。不过你任何时候都可以使用“登录”来创建账户。","intro":"你好！:heart_eyes: 看起来你挺喜欢这个讨论，但是你还没有注册账户。","value_prop":"当你创建了账户，我们能准确地追踪你的阅读进度，所以你能够在下一次访问时回到你上次阅读到的地方。你也可以在有新帖子的时候收到网页和邮件通知。并且你可以赞任何帖子来分享你的感谢。:heartbeat:"},"summary":{"enabled_description":"你正在查看这个主题的概括版本：由社群认定的最有意思的帖子。","description":"有 \u003cb\u003e{{count}}\u003c/b\u003e 个回复。","description_time":"主题有 \u003cb\u003e{{count}}\u003c/b\u003e 个回复，大约要花 \u003cb\u003e{{readingTime}} 分钟\u003c/b\u003e阅读。","enable":"概括本主题","disable":"显示所有帖子"},"deleted_filter":{"enabled_description":"这个主题包含已删除的帖子，他们已经被隐藏。","disabled_description":"主题中被删除的帖子已显示。","enable":"隐藏已删除的帖子","disable":"显示已删除的帖子"},"private_message_info":{"title":"消息","invite":"邀请其他...","remove_allowed_user":"是否将{{name}}从本条消息中移除？"},"email":"电子邮箱","username":"用户名","last_seen":"最后一次活动时间","created":"创建时间","created_lowercase":"创建时间","trust_level":"用户级别","search_hint":"用户名、电子邮件或 IP 地址","create_account":{"title":"创建新帐号","failed":"出问题了，有可能这个电子邮箱已经被注册了。试试忘记密码链接？"},"forgot_password":{"title":"重置密码","action":"我忘记了我的密码","invite":"输入你的用户名和电子邮箱地址，我们会发送密码重置邮件给你。","reset":"重置密码","complete_username":"如果你的账户名 \u003cb\u003e%{username}\u003c/b\u003e 存在，你将马上收到一封电子邮件，告诉你如何重置密码。","complete_email":"如果你的账户 \u003cb\u003e%{email}\u003c/b\u003e 存在，你将马上收到一封电子邮件，告诉你如何重置密码。","complete_username_found":"你的账户名 \u003cb\u003e%{username}\u003c/b\u003e 存在，你将马上收到一封电子邮件，告诉你如何重置密码。","complete_email_found":"你的账户 \u003cb\u003e%{email}\u003c/b\u003e 存在，你将马上收到一封电子邮件，告诉你如何重置密码。","complete_username_not_found":"没有帐户匹配这个用户名 \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"没有帐户匹配 \u003cb\u003e%{email}\u003c/b\u003e "},"login":{"title":"登录","username":"用户","password":"密码","email_placeholder":"电子邮箱地址或用户名","caps_lock_warning":"大小写锁定开启","error":"未知错误","rate_limit":"请等待一会再尝试登录。","blank_username_or_password":"请输入你的邮件地址或用户名，以及密码。","reset_password":"重置密码","logging_in":"登录中...","or":"或","authenticating":"验证中...","awaiting_confirmation":"你的帐号尚未激活，点击忘记密码链接来重新发送激活邮件。","awaiting_approval":"你的帐号尚未被论坛版主批准。一旦你的帐号获得批准，你会收到一封电子邮件。","requires_invite":"抱歉，本论坛仅接受邀请注册。","not_activated":"你还不能登录。我们之前在 \u003cb\u003e{{sentTo}}\u003c/b\u003e 发送了一封激活邮件给你。请按照邮件中的介绍来激活你的帐号。","not_allowed_from_ip_address":"你不能从该 IP 地址登录。","admin_not_allowed_from_ip_address":"你不能从这个 IP 地址以管理员身份登录。","resend_activation_email":"点击此处重新发送激活邮件。","sent_activation_email_again":"我们在 \u003cb\u003e{{currentEmail}}\u003c/b\u003e 又发送了一封激活邮件给你，邮件送达可能需要几分钟；请检查一下你邮箱的垃圾邮件文件夹。","to_continue":"请先登录","preferences":"你需要登录才能更改用户设置。","forgot":"我记不得账号详情了","google":{"title":"使用 Google 帐号登录","message":"正使用 Google 帐号验证登录（请确保浏览器没有禁止弹出窗口）"},"google_oauth2":{"title":"使用 Google 帐号登录","message":"使用 Google 帐号验证登录（请确保浏览器没有禁止弹出窗口）"},"twitter":{"title":"使用 Twitter 帐号登录","message":"正使用 Twitter 帐号验证登录（请确保浏览器没有禁止弹出窗口）"},"facebook":{"title":"使用 Facebook 帐号登录","message":"正使用 Facebook 帐号验证登录（请确保浏览器没有禁止弹出窗口）"},"yahoo":{"title":"使用 Yahoo 帐号登录","message":"正使用 Yahoo 帐号验证登录（请确保浏览器没有禁止弹出窗口）"},"github":{"title":"使用 GitHub 帐号登录","message":"正使用 GitHub 帐号验证登录（请确保浏览器没有禁止弹出窗口）"}},"apple_international":"Apple/国际化","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"更多…","options":"选项","whisper":"密语","add_warning":"这是一个正式的警告。","toggle_whisper":"折叠或展开密语","posting_not_on_topic":"你想回复哪一个主题？","saving_draft_tip":"保存中……","saved_draft_tip":"已保存","saved_local_draft_tip":"已本地保存","similar_topics":"你的主题有些类似于...","drafts_offline":"离线草稿","error":{"title_missing":"缺少标题","title_too_short":"标题太短，至少 {{min}} 个字符","title_too_long":"标题太长，至多 {{max}} 个字符。","post_missing":"帖子不能为空","post_length":"帖子至少应有 {{min}} 个字符","try_like":"你试过了 \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e 按钮吗？","category_missing":"你必须选择一个分类"},"save_edit":"保存编辑","reply_original":"回复原始话题","reply_here":"在此回复","reply":"回复","cancel":"取消","create_topic":"创建主题","create_pm":"消息","title":"或者按下 Ctrl + 回车","users_placeholder":"添加一个用户","title_placeholder":"用简要的一句话解释要讨论什么","edit_reason_placeholder":"编辑理由","show_edit_reason":"（添加编辑理由）","reply_placeholder":"正文。使用 Markdown、BBCode 或 HTML 格式化内容。拖拽或粘贴图片。","view_new_post":"浏览你的新帖子。","saving":"保存中","saved":"已保存！","saved_draft":"帖子还没写完，点击继续","uploading":"上传中...","show_preview":"显示预览 \u0026raquo;","hide_preview":"\u0026laquo; 隐藏预览","quote_post_title":"引用整个帖子","bold_title":"加粗","bold_text":"加粗文字","italic_title":"斜体","italic_text":"斜体文字","link_title":"链接","link_description":"在此输入链接描述","link_dialog_title":"插入链接","link_optional_text":"可选标题","link_placeholder":"http://example.com \"可选文字\"","quote_title":"引用","quote_text":"引用","code_title":"预格式化文本","code_text":"文字缩进4格","upload_title":"上传","upload_description":"在此输入上传资料的描述","olist_title":"数字列表","ulist_title":"符号列表","list_item":"列表条目","heading_title":"标题","heading_text":"标题头","hr_title":"分割线","help":"Markdown 编辑帮助","toggler":"隐藏或显示编辑面板","modal_ok":"确认","modal_cancel":"取消","cant_send_pm":"抱歉，你不能向 %{username} 发送私信。","admin_options_title":"本主题可选设置","auto_close":{"label":"自动关闭主题时间：","error":"请输入一个有效值。","based_on_last_post":"在最后一个帖子发表后暂不关闭主题的时间。","all":{"examples":"输入小时数（24），绝对时间（17:30）或时间戳（2013-11-22 14:00）。"},"limited":{"units":"(# 小时数）","examples":"输入小时数（24）。"}}},"notifications":{"title":"使用@名字提及到你，回复你的帖子和主题，消息等等的通知消息","none":"现在无法载入通知","more":"浏览以前的通知","total_flagged":"被报告帖子的总数","mentioned":"\u003ci title='被提及' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='引用' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='回复' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='回复' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='编辑' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='赞' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='私信' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='私信' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='邀请至主题' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='已接受你的邀请' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e 已接受你的邀请\u003c/p\u003e","moved_post":"\u003ci title='移动了帖子' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e 移动了 {{description}}\u003c/p\u003e","linked":"\u003ci title='被外链的帖子' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='徽章授予' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e获得“{{description}}”\u003c/p\u003e","alt":{"mentioned":"被提及","quoted":"被引用","replied":"回复","posted":"发自","edited":"编辑你的帖子","liked":"赞了你的帖子","private_message":"私信来自","invited_to_private_message":"私信邀请自","invited_to_topic":"主题邀请自","invitee_accepted":"介绍邀请自","moved_post":"你的帖子被移动自","linked":"链接至你的帖子","granted_badge":"勋章授予"},"popup":{"mentioned":"{{username}}在“{{topic}}”提到了你 - {{site_title}}","quoted":"{{username}}在“{{topic}}”引用了你的帖子 - {{site_title}}","replied":"{{username}}在“{{topic}}”回复了你 - {{site_title}}","posted":"{{username}}在“{{topic}}”中发布了帖子 - {{site_title}}","private_message":"{{username}}在“{{topic}}”中给你发送了一个消息 - {{site_title}}","linked":"{{username}}在“{{topic}}”中链接了你的帖子 - {{site_title}}"}},"upload_selector":{"title":"插入图片","title_with_attachments":"上传图片或文件","from_my_computer":"来自我的设备","from_the_web":"来自网络","remote_tip":"图片链接","remote_tip_with_attachments":"链接到图片或文件 {{authorized_extensions}}","local_tip":"从你的设备中选择图片","local_tip_with_attachments":"从你的设备 {{authorized_extensions}} 选择图片或文件","hint":"（你也可以通过拖放至编辑器的方式来上传）","hint_for_supported_browsers":"你也可以通过拖放或复制粘帖至编辑器","uploading":"上传中","select_file":"选择文件","image_link":"链接你的图片到"},"search":{"sort_by":"排序按","relevance":"相关性","latest_post":"最后发帖时间","most_viewed":"最多阅读","most_liked":"最多赞","select_all":"全选","clear_all":"清除所有","result_count":{"other":"搜索\u003cspan class='term'\u003e“{{term}}”\u003c/span\u003e有 {{count}} 条结果"},"title":"搜索主题、帖子、用户或分类","no_results":"没有找到结果。","no_more_results":"没有找到更多结果。","search_help":"搜索帮助","searching":"搜索中...","post_format":"#{{post_number}} 来自于 {{username}}","context":{"user":"搜索 @{{username}} 的帖子","category":"搜索“{{category}}”分类","topic":"只搜索本主题","private_messages":"搜索消息"}},"hamburger_menu":"去另一个主题列表或分类","new_item":"新","go_back":"返回","not_logged_in_user":"显示当前活动和设置的用户页面","current_user":"去你的用户页面","topics":{"bulk":{"unlist_topics":"未在列表上的主题","reset_read":"设为未读","delete":"删除主题","dismiss":"忽略","dismiss_read":"忽略所有未读","dismiss_button":"忽略...","dismiss_tooltip":"仅忽略新帖子或停止跟踪主题","also_dismiss_topics":"停止跟踪这些主题？（主题不再会显示在未读标签中）","dismiss_new":"设为已读","toggle":"切换批量选择","actions":"批量操作","change_category":"更改目录","close_topics":"关闭话题","archive_topics":"存档主题","notification_level":"更改提示等级","choose_new_category":"为主题选择新分类：","selected":{"other":"你已经选择了 \u003cb\u003e{{count}}\u003c/b\u003e个主题"}},"none":{"unread":"你没有未阅主题。","new":"你没有新主题可读。","read":"你尚未阅读任何主题。","posted":"你尚未在任何主题中发帖。","latest":"没有最新的讨论主题。","hot":"没有热门主题。","bookmarks":"你没有书签任何主题。","category":"没有{{category}}分类的主题。","top":"没有最佳主题。","search":"没有搜索结果。","educate":{"new":"\u003cp\u003e近期的主题将在这里显示。\u003c/p\u003e\u003cp\u003e默认情况下，近两天创建的主题是近期主题，并会显示一个\u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003e新\u003c/span\u003e的标识。\u003c/p\u003e\u003cp\u003e你可以在你的\u003ca href=\"%{userPrefsUrl}\"\u003e设置\u003c/a\u003e中改变这一行为。\u003c/p\u003e","unread":"\u003cp\u003e这里是你的未读主题。\u003c/p\u003e\u003cp\u003e默认情况下，下述主题将被认为是未读的，并会显示未读数目：\u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e 如果你：\u003c/p\u003e\u003cul\u003e\u003cli\u003e创建了该主题\u003c/li\u003e\u003cli\u003e回复了该主题\u003c/li\u003e\u003cli\u003e阅读该主题超过 4 分钟\u003c/li\u003e\u003c/ul\u003e\u003cp\u003e或者你在主题底部的通知控制中选择了追踪或监视。\u003c/p\u003e\u003cp\u003e你可以改变你的\u003ca href=\"%{userPrefsUrl}\"\u003e用户设置\u003c/a\u003e。\u003c/p\u003e"}},"bottom":{"latest":"没有更多主题可看了。","hot":"没有更多热门主题可看了。","posted":"没有更多已发布主题可看了。","read":"没有更多已阅主题可看了。","new":"没有更多新主题可看了。","unread":"没有更多未读主题了。","category":"没有更多{{category}}分类的主题了。","top":"没有更多最佳主题了。","bookmarks":"没有更多书签主题了。","search":"没有更多搜索结果。"}},"topic":{"unsubscribe":{"stop_notifications":"你将收到更少的关于\u003cstrong\u003e{{title}}\u003c/strong\u003e的通知","change_notification_state":"您现在的提醒状态是"},"filter_to":"本主题中的 {{post_count}} 帖","create":"新主题","create_long":"创建一个新主题","private_message":"发送消息","list":"主题","new":"新主题","unread":"未读","new_topics":{"other":"{{count}} 新主题"},"unread_topics":{"other":"{{count}} 未读主题"},"title":"主题","invalid_access":{"title":"这是私密主题","description":"抱歉，你没有访问此主题的权限！","login_required":"你需要登录才能阅读此主题。"},"server_error":{"title":"载入主题失败","description":"抱歉，无法载入主题。这可能是网络连接问题导致的。请重试一次。如果始终无法加载，请告诉我们。"},"not_found":{"title":"未找到主题","description":"抱歉，无法找到此主题。可能已被版主删除。"},"total_unread_posts":{"other":"在这个主题中，你有 {{count}} 条未读的帖子"},"unread_posts":{"other":"在这个主题中，你有 {{count}} 条未读的帖子"},"new_posts":{"other":"自你上一次阅读此主题后，又有 {{count}} 个新帖子发表"},"likes":{"other":"本主题已有 {{number}} 次赞"},"back_to_list":"返回主题列表","options":"主题选项","show_links":"显示此主题中的链接","toggle_information":"切换主题详细","read_more_in_category":"想阅读更多内容？浏览 {{catLink}} 或 {{latestLink}} 里的其它主题。","read_more":"想阅读更多内容？{{catLink}} 或 {{latestLink}}。","browse_all_categories":"浏览所有分类","view_latest_topics":"浏览最新主题","suggest_create_topic":"马上创建一个主题吧！","jump_reply_up":"跳转至更早的回复","jump_reply_down":"跳转至更晚的回复","deleted":"此主题已被删除","auto_close_notice":"本主题将在%{timeLeft}后自动关闭。","auto_close_notice_based_on_last_post":"在最后一个帖子 %{duration} 无人回复关闭帖子的时间。","auto_close_title":"自动关闭设置","auto_close_save":"保存","auto_close_remove":"不要自动关闭该主题","progress":{"title":"主题进度","go_top":"顶部","go_bottom":"底部","go":"前往","jump_bottom":"跳至最后一个帖子","jump_bottom_with_number":"跳转到第 %{post_number} 帖","total":"全部帖子","current":"当前帖","position":"%{total}帖中的第%{current}帖"},"notifications":{"reasons":{"3_6":"因为你在关注此分类，所以你将收到相关通知。","3_5":"因为你自动关注了此主题，所以你将收到相关通知。","3_2":"因为你在关注此主题，所以你将收到相关通知。","3_1":"因为你创建了此主题，所以你将收到相关通知。","3":"因为你在关注此主题，所以你将收到相关通知。","2_8":"因为你在追踪此分类，所以你将收到相关通知。","2_4":"因为你在此主题内发表了回复，所以你将收到相关通知。","2_2":"因为你在追踪此主题，所以你将收到相关通知。","2":"因为你\u003ca href=\"/users/{{username}}/preferences\"\u003e阅读了此主题\u003c/a\u003e，所以你将收到相关通知。","1_2":"如果某人@你或者回复你，你将收到通知。","1":"如果某人@你或者回复你，你将收到通知。","0_7":"你将忽略关于此分类的所有通知。","0_2":"你将忽略关于此主题的所有通知。","0":"你将忽略关于此主题的所有通知。"},"watching_pm":{"title":"关注","description":"你将会在该消息的每个新回复发布后收到通知，并且会显示新回复数量。"},"watching":{"title":"关注","description":"你将会在该主题的每个新回复发布后收到通知，并且会显示新回复数量。"},"tracking_pm":{"title":"追踪","description":"该消息标题后将显示新回复数量。你只会在别人@你或回复你的帖子时才会收到通知。"},"tracking":{"title":"追踪","description":"该主题标题后将显示新回复数量。你只会在别人@你或回复你的帖子时才会收到通知。"},"regular":{"title":"普通","description":"如果某人@你或者回复你，你将收到通知。"},"regular_pm":{"title":"普通","description":"如果某人@你或者回复你，你将收到通知。"},"muted_pm":{"title":"防打扰","description":"你不会收到关于此消息的任何通知。"},"muted":{"title":"防打扰","description":"你将不会再收到这个主题的任何通知，也不会出现在最新列表中。"}},"actions":{"recover":"撤销删除主题","delete":"删除主题","open":"打开主题","close":"关闭主题","multi_select":"选择帖子...","auto_close":"自动关闭...","pin":"置顶主题...","unpin":"解除主题置顶...","unarchive":"解除主题存档","archive":"存档主题","invisible":"使其不列于主题列表","visible":"使其列于主题列表","reset_read":"重置阅读数据"},"feature":{"pin":"置顶主题","unpin":"解除主题置顶","pin_globally":"全局置顶主题","make_banner":"横幅主题","remove_banner":"移除横幅主题"},"reply":{"title":"回复","help":"开始给本主题撰写回复"},"clear_pin":{"title":"解除置顶","help":"将本主题的置顶状态解除，这样它将不再始终显示在主题列表顶部"},"share":{"title":"分享","help":"分享一个到本帖的链接"},"flag_topic":{"title":"报告","help":"私下报告本帖以引起注意或者发送一条匿名通知","success_message":"你已成功报告本帖。"},"feature_topic":{"title":"设为精华主题","pin":"将该主题置于{{categoryLink}}分类最上方至","confirm_pin":"你已经有了{{count}}个置顶主题。太多的置顶主题可能会困扰新用户和访客。你确定想要在该分类再置顶一个主题么？","unpin":"从{{categoryLink}}分类最上方移除主题。","unpin_until":"从{{categoryLink}}分类最上方移除主题或者延迟至\u003cstrong\u003e%{until}\u003c/strong\u003e。","pin_note":"用户可以给自己解除置顶主题。","pin_validation":"置顶该主题需要一个日期。","not_pinned":"{{categoryLink}}没有置顶主题。","already_pinned":{"other":"现在置顶在{{categoryLink}}分类的主题：\u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"将主题置于所有主题列表最上方至","confirm_pin_globally":"你已经有了{{count}}个全局置顶主题。太多的置顶主题可能会困扰新用户和访客。你确定想要再全局置顶一个主题么？","unpin_globally":"将主题从所有主题列表的最上方移除。","unpin_globally_until":"从所有主题列表最上方移除主题或者延迟至\u003cstrong\u003e%{until}\u003c/strong\u003e。","global_pin_note":"用户可以自己解除主题状态。","not_pinned_globally":"没有全局置顶的主题。","already_pinned_globally":{"other":"现在全局置顶的主题：\u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"将主题置为所有页面顶端的横幅主题。","remove_banner":"移除所有页面顶端的横幅主题。","banner_note":"用户能点击关闭隐藏横幅。一次只能有一个横幅主题。","no_banner_exists":"没有横幅主题。","banner_exists":"当前有\u003cstrong class='badge badge-notification unread'\u003e一个\u003c/strong\u003e横幅主题。"},"inviting":"邀请中...","automatically_add_to_groups_optional":"这个邀请也包括了这些群组的权限：（可选，仅管理员）","automatically_add_to_groups_required":"这个邀请也包括了访问这些群组的权限：（\u003cb\u003e可选\u003c/b\u003e，仅管理员）","invite_private":{"title":"邀请消息交流","email_or_username":"受邀人的电子邮箱或用户名","email_or_username_placeholder":"电子邮箱地址或用户名","action":"邀请","success":"我们已经邀请了该用户加入这个消息交流。","error":"抱歉，在邀请该用户时发生了错误。","group_name":"群组名"},"invite_reply":{"title":" 邀请","username_placeholder":"用户名","action":"发送邀请","help":"邮件或通知邀请其他人至主题","to_forum":"我们将发送一封简洁的邮件让你的朋友通过点击一个链接参与讨论，不需要登录。","sso_enabled":"输入你想邀请的用户的用户名至该主题。","to_topic_blank":"输入你想邀请的用户的用户名或邮箱地址至该主题","to_topic_email":"你已经输入了邮箱地址。我们将发送一封邮件邀请让你的朋友可直接回复该主题。","to_topic_username":"你已经输入了用户名。我们将发送一封邀请邮件，其中包含了一个链接可以让你的朋友参与该主题的讨论。","to_username":"输入你想邀请的人的用户名。我们将发送一个邀请，其中包含了一个链接可以让你他们直接参与该主题。","email_placeholder":"电子邮箱地址","success_email":"我们发了一封邀请邮件给 \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e。我们将在邀请被接受后通知你。检查你的用户中的邀请标签页来追踪你的邀请。","success_username":"我们已经邀请了该用户参与该主题。","error":"抱歉，我们不能邀请这个人。可能他已经被邀请了？（邀请还有频率限制）"},"login_reply":"登录后回复","filters":{"n_posts":{"other":"{{count}} 个帖子"},"cancel":"取消过滤器"},"split_topic":{"title":"拆分主题","action":"拆分主题","topic_name":"新主题名","error":"拆分主题时发生错误。","instructions":{"other":"你将创建一个新的主题，并包含 \u003cb\u003e{{count}}\u003c/b\u003e 个你选择的帖子。"}},"merge_topic":{"title":"合并主题","action":"合并主题","error":"合并主题时发生错误。","instructions":{"other":"请选择一个主题以便移动这 \u003cb\u003e{{count}}\u003c/b\u003e 个帖子。"}},"change_owner":{"title":"更改帖子所有者","action":"更改所有权","error":"更改帖子所有权时发生错误。","label":"帖子的新拥有者","placeholder":"新所有者的用户名","instructions":{"other":"请选择\u003cb\u003e{{old_user}}\u003c/b\u003e创建的这 {{count}} 个帖子的新所有者。"},"instructions_warn":"注意所有的关于这个帖子的通知不会被发送到新用户。\u003cbr\u003e警告：目前，没有任何与帖子关联的数据会被传递给新用户。谨慎使用。"},"change_timestamp":{"title":"修改时间戳","action":"修改时间戳","invalid_timestamp":"时间戳不能是未来的时间。","error":"更改主题时间戳时发生错误。","instructions":"请为主题选择新的时间戳。主题中的所有帖子将按照相同的时间差更新。"},"multi_select":{"select":"选择","selected":"已选择（{{count}}）","select_replies":"选择以及回复其的帖子","delete":"删除所选","cancel":"取消选择","select_all":"全选","deselect_all":"全不选","description":{"other":"你已经选择了 \u003cb\u003e{{count}}\u003c/b\u003e 个帖子。"}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"引用回复","edit":"编辑 {{replyAvatar}} {{username}} 发表的 {{link}}","edit_reason":"理由：","post_number":"帖子 {{number}}","last_edited_on":"最后修改于","reply_as_new_topic":"回复为联结主题","continue_discussion":"从 {{postLink}} 继续讨论：","follow_quote":"跳转至所引用的帖子","show_full":"显示所有帖子","show_hidden":"查看隐蔽内容","deleted_by_author":{"other":"（帖子被作者撤销，如无标记，将在 %{count} 小时后被自动删除）"},"expand_collapse":"展开/折叠","gap":{"other":"查看 {{count}} 个隐藏回复"},"more_links":"{{count}} 更多...","unread":"主题是未读的","has_replies":{"other":"{{count}} 回复"},"has_likes":{"other":"{{count}} 赞"},"has_likes_title":{"other":"{{count}} 人赞了该贴"},"has_likes_title_only_you":"你赞了该贴","has_likes_title_you":{"other":"你和其他 {{count}} 人赞了该贴"},"errors":{"create":"抱歉，在创建你的帖子时发生了错误。请重试。","edit":"抱歉，在编辑你的帖子时发生了错误。请重试。","upload":"抱歉，在上传文件时发生了错误。请重试。","attachment_too_large":"抱歉，你上传的附件太大了（最大不能超过 {{max_size_kb}}kb）。","file_too_large":"抱歉，你上传的附件太大了（最大限制 {{max_size_kb}}kb）。","too_many_uploads":"抱歉，你只能一次上传一张图片。","too_many_dragged_and_dropped_files":"抱歉，你一次只能拖放最多 10 个文件。","upload_not_authorized":"抱歉，你不能上传此类型文件（可上传的文件类型有: {{authorized_extensions}}）。","image_upload_not_allowed_for_new_user":"抱歉，新注册用户无法上传图片。","attachment_upload_not_allowed_for_new_user":"抱歉，新注册用户无法上传附件。","attachment_download_requires_login":"抱歉，但是你需要登录后才能下载附件。"},"abandon":{"confirm":"你确定要放弃编辑你的帖子吗？","no_value":"否","yes_value":"是"},"via_email":"通过电子邮件发送的帖子","whisper":"这个帖子是只对版主可见的密语","wiki":{"about":"这个帖子是维基；基础用户能编辑它"},"archetypes":{"save":"保存选项"},"controls":{"reply":"开始给本帖撰写回复","like":"赞本帖","has_liked":"你已经赞了本帖","undo_like":"撤销赞","edit":"编辑本帖","edit_anonymous":"抱歉，但是你需要登录后才能编辑该贴。","flag":"私下报告本帖以提醒管理人员关注或发送私信通知","delete":"删除本帖","undelete":"恢复本帖","share":"分享一个到本帖的链接","more":"更多","delete_replies":{"confirm":{"other":"你也想要删除 {{count}} 个直接回复这个帖子的回复么？"},"yes_value":"是，删除回复","no_value":"否，仅删除该帖"},"admin":"帖子管理","wiki":"使其成为维基帖子","unwiki":"使其成为普通帖子","convert_to_moderator":"增加职员颜色","revert_to_regular":"移除职员颜色","rebake":"重建 HTML","unhide":"显示","change_owner":"更改所有权"},"actions":{"flag":"报告","defer_flags":{"other":"推迟的标记"},"it_too":{"off_topic":"同时报告","spam":"同时报告","inappropriate":"同时报告","custom_flag":"同时报告","bookmark":"同时添加书签","like":"赞","vote":"同时投票支持"},"undo":{"off_topic":"撤销报告","spam":"撤销报告","inappropriate":"撤销报告","bookmark":"撤销书签","like":"撤销赞","vote":"撤销投票"},"people":{"off_topic":"{{icons}} 标记为偏离主题","spam":"{{icons}} 标记为垃圾","spam_with_url":"{{icons}} 标记为\u003ca href='{{postUrl}}'\u003e垃圾信息\u003c/a\u003e","inappropriate":"{{icons}} 标记此为不当内容","notify_moderators":"{{icons}} 向版主报告它","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003e通知了版主\u003c/a\u003e","notify_user":"{{icons}} 发送了一个消息","notify_user_with_url":"{{icons}} 发送了一个\u003ca href='{{postUrl}}'\u003e消息\u003c/a\u003e","bookmark":"{{icons}} 对它做了书签","like":"{{icons}} 赞了它","vote":"{{icons}} 对它投票"},"by_you":{"off_topic":"你报告它偏离主题","spam":"你报告它为垃圾信息","inappropriate":"你报告它为不当内容","notify_moderators":"你向版主报告了它","notify_user":"你已经发了一个消息给该用户","bookmark":"你对该帖做了书签","like":"你赞了它","vote":"你对该帖投票支持"},"by_you_and_others":{"off_topic":{"other":"你和其他 {{count}} 人报告它偏离主题"},"spam":{"other":"你和其他 {{count}} 人报告它为垃圾信息"},"inappropriate":{"other":"你和其他 {{count}} 人报告它为不当内容"},"notify_moderators":{"other":"你和其他 {{count}} 人报告它需要审核"},"notify_user":{"other":"你和 {{count}} 个其他用户发了一个消息给该用户"},"bookmark":{"other":"你和其他 {{count}} 人收藏了这个帖子"},"like":{"other":"你和其他 {{count}} 人赞了这个帖子"},"vote":{"other":"你和其他 {{count}} 人支持这个帖子"}},"by_others":{"off_topic":{"other":"{{count}} 人报告它偏离主题"},"spam":{"other":"{{count}} 人报告它为垃圾信息"},"inappropriate":{"other":"{{count}} 人报告它为不当内容"},"notify_moderators":{"other":"{{count}} 人报告它需要修改"},"notify_user":{"other":"{{count}} 人给这个用户发送了消息"},"bookmark":{"other":"{{count}} 人收藏了这个帖子"},"like":{"other":"{{count}} 人赞了这个帖子"},"vote":{"other":"{{count}} 人支持这个帖子"}}},"delete":{"confirm":{"other":"你确定要删除这些帖子吗？"}},"revisions":{"controls":{"first":"第一版","previous":"上一版","next":"下一版","last":"最新版","hide":"隐藏版本历史","show":"显示版本历史","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"以生成页面显示，并标示增加和删除的内容","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"以并排页面显示，分开标示增加和删除的内容","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"并列显示源代码差异信息","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e 原始"}}}},"category":{"can":"能够\u0026hellip; ","none":"（未分类）","all":"所有分类","choose":"选择分类\u0026hellip;","edit":"编辑","edit_long":"编辑","view":"浏览分类下的主题","general":"常规","settings":"设置","topic_template":"主题模板","delete":"删除分类","create":"新分类","create_long":"创建新的分类","save":"保存分类","slug":"分类 Slug","slug_placeholder":"（可选）用于分类的 URL","creation_error":"创建此分类时发生了错误。","save_error":"在保存此分类时发生了错误。","name":"分类名称","description":"描述","topic":"分类主题","logo":"分类标志图片","background_image":"分类背景图片","badge_colors":"徽章颜色","background_color":"背景色","foreground_color":"前景色","name_placeholder":"应该简明扼要。","color_placeholder":"任何网页颜色","delete_confirm":"你确定要删除此分类吗？","delete_error":"在删除此分类时发生了错误。","list":"列出分类","no_description":"请为本分类添加描述信息。","change_in_category_topic":"访问分类主题来编辑描述信息","already_used":"此色彩已经被另一个分类使用","security":"安全性","special_warning":"警告：这个分类是已经自动建立好的分类，它的安全设置不能被更改。如果你不想要使用这个分类，直接删除它，而不是另作他用。","images":"图片","auto_close_label":"该时间段后自动关闭主题：","auto_close_units":"小时","email_in":"自定义进站电子邮件地址：","email_in_allow_strangers":"接受无账号的匿名用户的邮件","email_in_disabled":"站点设置中已经禁用通过邮件发表新主题。欲启用通过邮件发表新主题，","email_in_disabled_click":"启用“邮件发表”设置。","contains_messages":"改变分类仅包括消息。","suppress_from_homepage":"不在主页中显示这个分类。","allow_badges_label":"允许在这个分类中授予徽章","edit_permissions":"编辑权限","add_permission":"添加权限","this_year":"今年","position":"位置","default_position":"默认位置","position_disabled":"分类按照其活跃程度的顺序显示。要固定分类列表的显示顺序，","position_disabled_click":"启用“固定分类位置”设置。","parent":"上级分类","notifications":{"watching":{"title":"关注","description":"你将会自动监视这些分类中的所有新主题。你会收到每个主题中的新帖子通知，并且新帖数量也将在每个主题后显示。"},"tracking":{"title":"追踪","description":"你将会自动追踪这些分类中的所有新主题。你会在别人@你或回复你的帖子时才会收到通知，并且新帖数量也将在这些主题后显示。"},"regular":{"title":"常规","description":"如果某人@你或者回复你，你将收到通知。"},"muted":{"title":"免打扰","description":"你不会收到这些分类中的任何新主题通知，并且他们将不会出现在最新列表中。"}}},"flagging":{"title":"感谢帮助社群远离邪恶！","private_reminder":"标记是不公开的，\u003cb\u003e只有\u003c/b\u003e职员才可以见到","action":"报告帖子","take_action":"立即执行","notify_action":"消息","delete_spammer":"删除垃圾发布者","delete_confirm":"你将删除该用户的 \u003cb\u003e%{posts}\u003c/b\u003e 个帖子和 \u003cb\u003e%{topics}\u003c/b\u003e 个主题，删除该账户，阻止其IP地址 \u003cb\u003e%{ip_address}\u003c/b\u003e 再次注册，并将其邮件地址 \u003cb\u003e%{email}\u003c/b\u003e 加入黑名单。确定吗？","yes_delete_spammer":"确定","ip_address_missing":"（N/A）","hidden_email_address":"（隐藏）","submit_tooltip":"提交私有标记","take_action_tooltip":"立即采取标记到达限制值时的措施，而不是等待更多的社群标记","cant":"抱歉，当前你不能报告本帖。","notify_staff":"通知员工","formatted_name":{"off_topic":"偏题","inappropriate":"不合适","spam":"广告"},"custom_placeholder_notify_user":"请具体说明，有建设性的，再友好一些。","custom_placeholder_notify_moderators":"让我们知道你关心地是什么，并尽可能地提供相关链接和例子。","custom_message":{"at_least":"输入至少 {{n}} 个字符","more":"还差 {{n}} 个...","left":"还剩下 {{n}}"}},"flagging_topic":{"title":"感谢帮助社群远离邪恶！","action":"报告帖子","notify_action":"消息"},"topic_map":{"title":"主题概要","participants_title":"频繁发帖者","links_title":"热门链接","links_shown":"显示所有 {{totalLinks}} 个链接...","clicks":{"other":"%{count} 次点击"}},"topic_statuses":{"warning":{"help":"这是一个正式的警告。"},"bookmarked":{"help":"你已经收藏了此主题"},"locked":{"help":"本主题已关闭；不再接受新的回复"},"archived":{"help":"本主题已归档；即已经冻结，无法修改"},"locked_and_archived":{"help":"本主题已经关闭并且存档；不再接受新回复且无法修改"},"unpinned":{"title":"解除置顶","help":"主题已经解除置顶；它将以默认顺序显示"},"pinned_globally":{"title":"全局置顶","help":"本主题已全局置顶；它始终会在最新列表以及它所属的分类中置顶"},"pinned":{"title":"置顶","help":"本主题已置顶；它将始终显示在它所属分类的顶部"},"invisible":{"help":"本主题被设置为不显示在主题列表中，并且只能通过直达链接来访问"}},"posts":"帖子","posts_lowercase":"帖子","posts_long":"本主题有 {{number}} 个帖子","original_post":"原始帖","views":"浏览","views_lowercase":{"other":"浏览"},"replies":"回复","views_long":"本主题已经被浏览过 {{number}} 次","activity":"活动","likes":"赞","likes_lowercase":{"other":"赞"},"likes_long":"本主题已有 {{number}} 次赞","users":"参与者","users_lowercase":{"other":"用户"},"category_title":"分类","history":"历史","changed_by":"由 {{author}}","raw_email":{"title":"原始邮件","not_available":"不可用！"},"categories_list":"分类列表","filters":{"with_topics":"%{filter}主题","with_category":"%{category}的%{filter}主题","latest":{"title":"最新","title_with_count":{"other":"最新（{{count}}）"},"help":"最新发布的帖子"},"hot":{"title":"热门","help":"最近最受欢迎的主题"},"read":{"title":"已阅","help":"你已经阅读过的主题"},"search":{"title":"搜索","help":"搜索所有主题"},"categories":{"title":"分类","title_in":"分类 - {{categoryName}}","help":"归属于不同分类的所有主题"},"unread":{"title":"未读","title_with_count":{"other":"{{count}} 个未读主题"},"help":"你正在监视或追踪的主题中有未阅帖子的主题","lower_title_with_count":{"other":"{{count}} 条未读"}},"new":{"lower_title_with_count":{"other":"{{count}} 近期"},"lower_title":"近期","title":"近期","title_with_count":{"other":"近期（{{count}}）"},"help":"最近几天创建的主题"},"posted":{"title":"我的帖子","help":"你发表过帖子的主题"},"bookmarks":{"title":"书签","help":"你标上书签的主题"},"category":{"title":"{{categoryName}}","title_with_count":{"other":"{{categoryName}}（{{count}}）"},"help":"在 {{categoryName}} 分类中热门的主题"},"top":{"title":"热门","help":"最近一年、一月、一周或一天的最活跃主题","all":{"title":"不限时间"},"yearly":{"title":"年度"},"quarterly":{"title":"季度的"},"monthly":{"title":"月度"},"weekly":{"title":"每周"},"daily":{"title":"每天"},"all_time":"不限时间","this_year":"年","this_quarter":"季度","this_month":"月","this_week":"周","today":"今天","other_periods":"跳转到顶部"}},"browser_update":"抱歉，\u003ca href=\"http://www.discourse.com/faq/#browser\"\u003e你的浏览器版本太低，无法正常访问该站点。\u003c/a\u003e。请\u003ca href=\"http://browsehappy.com\"\u003e升级你的浏览器\u003c/a\u003e。","permission_types":{"full":"创建 / 回复 / 阅读","create_post":"回复 / 阅读","readonly":"阅读"},"docker":{"upgrade":"Docker 负责升级。","perform_upgrade":"点击这儿升级。"},"poll":{"voters":{"other":"投票者"},"total_votes":{"other":"总票数"},"average_rating":"平均排名：\u003cstrong\u003e%{average}\u003c/strong\u003e。","multiple":{"help":{"at_least_min_options":{"other":"你必须选择至少 \u003cstrong\u003e%{count}\u003c/strong\u003e 个选项。"},"up_to_max_options":{"other":"你可以选择最多 \u003cstrong\u003e%{count}\u003c/strong\u003e 个选项。"},"x_options":{"other":"你必须选择 \u003cstrong\u003e%{count}\u003c/strong\u003e 个选项。"},"between_min_and_max_options":"你可以选择 \u003cstrong\u003e%{min}\u003c/strong\u003e 至 \u003cstrong\u003e%{max}\u003c/strong\u003e 个选项。"}},"cast-votes":{"title":"投你的票","label":"现在投票！"},"show-results":{"title":"显示投票结果","label":"显示结果"},"hide-results":{"title":"返回到你的投票","label":"隐藏结果"},"open":{"title":"开启投票","label":"开启","confirm":"你确定要开启这个投票么？"},"close":{"title":"关闭投票","label":"关闭","confirm":"你确定要关闭这个投票？"},"error_while_toggling_status":"改变投票状态时出错。","error_while_casting_votes":"执行投票时发生了错误。"},"type_to_filter":"输入过滤条件...","admin":{"title":"Discourse 管理员","moderator":"版主","dashboard":{"title":"仪表盘","last_updated":"最近更新于：","version":"安装的版本","up_to_date":"你正在运行最新的论坛版本。","critical_available":"有一个关键更新可用。","updates_available":"目前有可用更新。","please_upgrade":"请升级！","no_check_performed":"检测更新未执行，请确保 sidekiq 在正常运行。","stale_data":"最近一次检查更新未执行，请确保 sidekiq 在正常运行。","version_check_pending":"看来你最近刚更新过。太棒了！","installed_version":"已安装","latest_version":"最新版本","problems_found":"你安装的论坛目前有以下问题：","last_checked":"上次检查","refresh_problems":"刷新","no_problems":"找不到问题.","moderators":"版主：","admins":"管理员：","blocked":"禁止参与讨论:","suspended":"禁止登录","private_messages_short":"消息","private_messages_title":"消息","mobile_title":"移动","space_free":"{{size}} 空闲","uploads":"上传","backups":"备份","traffic_short":"流量","traffic":"应用 web 请求","page_views":"API 请求","page_views_short":"API 请求","show_traffic_report":"显示详细的流量报告","reports":{"today":"今天","yesterday":"昨天","last_7_days":"7 天以内","last_30_days":"30 天以内","all_time":"所有时间内","7_days_ago":"7 天之前","30_days_ago":"30 天之前","all":"全部","view_table":"表格","view_chart":"柱状图","refresh_report":"刷新报告","start_date":"开始日期","end_date":"结束日期"}},"commits":{"latest_changes":"最近的更新：请经常升级！","by":"来自"},"flags":{"title":"报告","old":"旧的","active":"待处理","agree":"已批准","agree_title":"确认这个标记有效且正确","agree_flag_modal_title":"批准并...","agree_flag_hide_post":"批准（隐藏并发送私信）","agree_flag_hide_post_title":"隐藏帖子并自动发送消息要求用户修改","agree_flag_restore_post":"同意 (还原帖子)","agree_flag_restore_post_title":"还原这篇帖子","agree_flag":"批准这个标记","agree_flag_title":"批准这个标记并且保持帖子不变","defer_flag":"推迟","defer_flag_title":"移除标记；这次不处理。","delete":"删除","delete_title":"删除标记指向的帖子。","delete_post_defer_flag":"删除帖子并推迟标记","delete_post_defer_flag_title":"删除此帖；如果这是这个主题内的第一篇帖子则删除主题","delete_post_agree_flag":"删除帖子并批准此标记","delete_post_agree_flag_title":"删除此帖；如果这是这个主题内的第一篇帖子则删除主题","delete_flag_modal_title":"删除并...","delete_spammer":"删除垃圾发布者","delete_spammer_title":"移除该用户及其的所有帖子和主题。","disagree_flag_unhide_post":"不批准（不隐藏帖子）","disagree_flag_unhide_post_title":"清除此帖的任何报告，并使其重新可见","disagree_flag":"不批准","disagree_flag_title":"拒绝这个报告，无效或不正确","clear_topic_flags":"完成","clear_topic_flags_title":"这个主题已被调查且提案已被解决。单击\u003cstrong\u003e完成\u003c/strong\u003e以删除报告。","more":"（更多回复...）","dispositions":{"agreed":"已批准","disagreed":"未批准","deferred":"推迟"},"flagged_by":"报告者为","resolved_by":"已解决，被","took_action":"立即执行","system":"系统","error":"出错了","reply_message":"回复","no_results":"没有报告","topic_flagged":"这个\u003cstrong\u003e主题\u003c/strong\u003e已被报告。","visit_topic":"浏览主题才能操作","was_edited":"帖子在第一次标记后被编辑","previous_flags_count":"这篇帖子已经被标示了 {{count}} 次。","summary":{"action_type_3":{"other":"偏离主题 x{{count}}"},"action_type_4":{"other":"不当内容 x{{count}}"},"action_type_6":{"other":"自定义 x{{count}}"},"action_type_7":{"other":"自定义 x{{count}}"},"action_type_8":{"other":"广告 x{{count}}"}}},"groups":{"primary":"主键组","no_primary":"(无主要群组)","title":"群组","edit":"编辑群组","refresh":"刷新","new":"新群组","selector_placeholder":"输入用户名","name_placeholder":"组名，不能含有空格，与用户名规则一致","about":"在这里编辑群组的名字和成员","group_members":"群组成员","delete":"删除","delete_confirm":"删除这个小组吗？","delete_failed":"无法删除小组。如果该小组是自动生成的，则不可删除。","delete_member_confirm":"从群组“%{group}”中移除“%{username}”？","delete_owner_confirm":"移除'%{username}'的权限？","name":"名字","add":"添加","add_members":"添加成员","custom":"定制","bulk_complete":"用户已被添加到小组。","bulk":"批量添加到小组","bulk_paste":"粘贴用户名或email列表，一行一个：","bulk_select":"（选择一个小组）","automatic":"自动","automatic_membership_email_domains":"用户注册时邮箱域名若与列表完全匹配则自动添加至这个群组：","automatic_membership_retroactive":"应用同样的邮件域名规则添加已经注册的用户","default_title":"群组内所有用户的默认头衔","primary_group":"自动设置为主要群组","group_owners":"所有者","add_owners":"添加所有者"},"api":{"generate_master":"生成主 API 密钥","none":"当前没有可用的 API 密钥。","user":"用户","title":"API","key":"API 密钥","generate":"生成","regenerate":"重新生成","revoke":"撤销","confirm_regen":"确定要用新的 API 密钥替代该密钥？","confirm_revoke":"确定要撤销该密钥？","info_html":"API 密钥可以用来通过 JSON 调用创建和更新主题。","all_users":"所有用户","note_html":"请\u003cstrong\u003e安全地\u003c/strong\u003e保管密钥，任何拥有该密钥的用户可以使用它以论坛任何用户的名义发帖。"},"plugins":{"title":"插件","installed":"安装的插件","name":"名字","none_installed":"你没有安装任何插件。","version":"版本","enabled":"启用？","is_enabled":"是","not_enabled":"否","change_settings":"更改设置","change_settings_short":"设置","howto":"如何安装插件？"},"backups":{"title":"备份","menu":{"backups":"备份","logs":"日志"},"none":"无可用备份","read_only":{"enable":{"title":"启用只读模式","label":"启用只读模式","confirm":"你确定要打开只读模式吗？"},"disable":{"title":"禁用只读模式","label":"关闭只读模式"}},"logs":{"none":"暂无日志"},"columns":{"filename":"文件名","size":"大小"},"upload":{"label":"上传","title":"上传备份至实例","uploading":"上传中……","success":"'{{filename}}'已成功上传。","error":"在上传的'{{filename}}'过程中出现错误：({{message}})"},"operations":{"is_running":"已有操作正在执行","failed":"执行{{operation}}失败。请检查日志。","cancel":{"label":"取消","title":"取消当前操作","confirm":"你确定要取消当前操作吗？"},"backup":{"label":"备份","title":"建立一个备份","confirm":"你确定要开始建立一个备份吗？","without_uploads":"是（不包括文件）"},"download":{"label":"下载","title":"下载该备份"},"destroy":{"title":"删除备份","confirm":"你确定要删除该备份吗？"},"restore":{"is_disabled":"站点设置中禁用了恢复功能。","label":"恢复","title":"恢复该备份","confirm":"你确定要重置该备份吗？"},"rollback":{"label":"回滚","title":"将数据库回滚到之前的工作状态","confirm":"你确定要将数据库回滚到之前的工作状态吗？"}}},"export_csv":{"user_archive_confirm":"你确定要下载你的帖子吗？","success":"导出开始，完成后你将被通过消息通知。","failed":"导出失败。请检查日志。","rate_limit_error":"帖子只能每天下载一次，请明天再重试。","button_text":"导出","button_title":{"user":"以CSV格式导出所有用户列表","staff_action":"以CSV格式导出所有职员操作历史记录","screened_email":"以 CSV 格式导出所有已显示的电子邮件列表。","screened_ip":"以 CSV 格式导出所有已显示的IP地址列表。","screened_url":"以 CSV 格式导出所有已显示的URL列表。"}},"export_json":{"button_text":"导出"},"invite":{"button_text":"发送邀请","button_title":"发送邀请"},"customize":{"title":"定制","long_title":"站点定制","css":"CSS","header":"头部","top":"顶部","footer":"底部","embedded_css":"嵌入的 CSS","head_tag":{"text":"\u003c/head\u003e","title":"将在 \u003c/head\u003e 标签前插入的 HTML"},"body_tag":{"text":"\u003c/body\u003e","title":"将在 \u003c/body\u003e 标签前插入的 HTML"},"override_default":"覆盖缺省值？","enabled":"启用？","preview":"预览","undo_preview":"移除预览","rescue_preview":"默认样式","explain_preview":"以自定义样式浏览此网页","explain_undo_preview":"返回目前使用中的自定义样式","explain_rescue_preview":"以默认样式浏览此网页","save":"保存","new":"新建","new_style":"新样式","import":"导入","import_title":"选择一个文件或者粘贴文本","delete":"删除","delete_confirm":"删除本定制内容？","about":"修改站点的 CSS 样式表和 HTML 头部。添加一个自定义方案开始。","color":"颜色","opacity":"透明度","copy":"复制","email_templates":{"title":"邮件模板","subject":"主题","body":"内容","none_selected":"选择一个邮件模板开始编辑。","revert":"撤销更变","revert_confirm":"你确定要撤销你的更变吗？"},"css_html":{"title":"CSS/HTML","long_title":"自定义 CSS 和 HTML"},"colors":{"title":"颜色","long_title":"颜色方案","about":"颜色方案让你能够让你在不写 CSS 的情况下更改色彩。添加一种颜色以开始。","new_name":"新的颜色方案","copy_name_prefix":"复制于","delete_confirm":"删除这个颜色方案？","undo":"重做","undo_title":"撤销你对这个颜色的编辑至上一次保存的状态。","revert":"撤销","revert_title":"重置这个颜色至 Discourse 的默认颜色方案","primary":{"name":"主要","description":"大部分的文字、图标和边框。"},"secondary":{"name":"次要的","description":"主要背景颜色和一些按钮的文字颜色。"},"tertiary":{"name":"第三的","description":"链接、一些按钮、提示和强调颜色。"},"quaternary":{"name":"第四的","description":"导航链接"},"header_background":{"name":"顶栏背景","description":"站点顶栏背景颜色"},"header_primary":{"name":"顶栏主要","description":"顶栏的文字和图标"},"highlight":{"name":"高亮","description":"页面中高亮元素的背景色，如帖子和主题。"},"danger":{"name":"危险","description":"危险操作如删除帖子和主题的高亮颜色"},"success":{"name":"成功","description":"用于指示操作成功。"},"love":{"name":"赞","description":"赞按钮的颜色。"},"wiki":{"name":"维基编辑","description":"维基帖子的背景颜色"}}},"email":{"title":"电子邮件","settings":"设置","all":"所有","sending_test":"发送测试邮件...","error":"\u003cb\u003e错误\u003c/b\u003e - %{server_error}","test_error":"发送测试邮件时遇到问题。请再检查一遍邮件设置，确认你的主机没有封锁邮件链接，然后重试。","sent":"已发送","skipped":"跳过","sent_at":"发送时间","time":"时间","user":"用户","email_type":"邮件类型","to_address":"目的地址","test_email_address":"测试电子邮件地址","send_test":"发送测试电子邮件","sent_test":"已发送！","delivery_method":"发送方式","preview_digest":"预览","preview_digest_desc":"预览发送给不活跃用户的摘要邮件内容。","refresh":"刷新","format":"格式","html":"html","text":"text","last_seen_user":"用户最后登录时间:","reply_key":"回复关键字","skipped_reason":"跳过理由","logs":{"none":"未发现日志。","filters":{"title":"过滤器","user_placeholder":"username","address_placeholder":"name@example.com","type_placeholder":"摘要、注册…","reply_key_placeholder":"回复键","skipped_reason_placeholder":"原因"}}},"logs":{"title":"日志","action":"操作","created_at":"创建","last_match_at":"最近匹配","match_count":"匹配","ip_address":"IP","topic_id":"主题 ID","post_id":"帖子 ID","category_id":"分类 ID","delete":"删除","edit":"编辑","save":"保存","screened_actions":{"block":"封禁","do_nothing":"无操作"},"staff_actions":{"title":"管理人员操作","instructions":"点击用户名和操作可以过滤列表。点击头像可以访问用户个人页面。","clear_filters":"显示全部","staff_user":"管理人员","target_user":"目标用户","subject":"主题","when":"时间","context":"环境","details":"详情","previous_value":"之前","new_value":"新建","diff":"差别","show":"显示","modal_title":"详情","no_previous":"没有之前的值。","deleted":"没有新的值。记录被删除。","actions":{"delete_user":"删除用户","change_trust_level":"更改信任等级","change_username":"修改用户名","change_site_setting":"更改站点设置","change_site_customization":"更改站点自定义","delete_site_customization":"删除站点自定义","suspend_user":"封禁用户","unsuspend_user":"解禁用户","grant_badge":"授予徽章","revoke_badge":"撤销徽章","check_email":"检查电子邮件","delete_topic":"删除主题","delete_post":"删除帖子","impersonate":"检视","anonymize_user":"匿名用户","roll_up":"回退 IP 封禁","change_category_settings":"更改分类设置","delete_category":"删除分类","create_category":"创建分类"}},"screened_emails":{"title":"被屏蔽的邮件地址","description":"当有人试图用以下邮件地址注册时，将受到阻止或其它系统操作。","email":"邮件地址","actions":{"allow":"允许"}},"screened_urls":{"title":"被屏蔽的 URL","description":"以下是垃圾信息发布者使用过的 URL。","url":"URL","domain":"域名"},"screened_ips":{"title":"被屏蔽的 IP","description":"受监视的 IP 地址，使用“放行”可将 IP 地址加入白名单。","delete_confirm":"确定要撤销对 IP 地址为 %{ip_address} 的规则？","roll_up_confirm":"你确定要将常用的 IP 地址归类为子网地址吗？","rolled_up_some_subnets":"成功地折叠了 IP 封禁记录至这些子网： %{subnets}。","rolled_up_no_subnet":"无法折叠。","actions":{"block":"封禁","do_nothing":"放行","allow_admin":"允许管理"},"form":{"label":"新：","ip_address":"IP地址","add":"添加","filter":"搜索"},"roll_up":{"text":"折叠","title":"如果有至少 'min_ban_entries_for_roll_up' 个记录，创建一个子网封禁记录"}},"logster":{"title":"错误日志"}},"impersonate":{"title":"检视用户视角","help":"使用此工具来检视其他用户的帐号以方便调试。你应该在完成后立即登出。","not_found":"无法找到该用户。","invalid":"抱歉，您不能以此用户角度检视。"},"users":{"title":"用户","create":"添加管理员用户","last_emailed":"最后一次邮寄","not_found":"抱歉，在我们的系统中此用户名不存在。","id_not_found":"抱歉，在我们的系统中此用户 id 不存在。","active":"活跃","show_emails":"显示邮件","nav":{"new":"新建","active":"活跃","pending":"待定","staff":"职员","suspended":"禁止登录","blocked":"禁止参与讨论","suspect":"怀疑"},"approved":"已批准？","approved_selected":{"other":"批准用户（{{count）"},"reject_selected":{"other":"拒绝用户（{{count}}）"},"titles":{"active":"活动用户","new":"新用户","pending":"等待审核用户","newuser":"信用等级为0的用户（新用户）","basic":"信用等级为1的用户（基本用户）","member":"信用等级为2的用户（成员）","regular":"信用等级为3的用户（活跃）","leader":"信用等级为4的用户（领导）","staff":"职员","admins":"管理员","moderators":"版主","blocked":"被封用户","suspended":"被禁用户","suspect":"嫌疑用户"},"reject_successful":{"other":"成功拒绝 %{count} 个用户。"},"reject_failures":{"other":"成功拒绝 %{count} 个用户。"},"not_verified":"未验证","check_email":{"title":"显示用户电子邮件","text":"显示"}},"user":{"suspend_failed":"禁止此用户时发生了错误 {{error}}","unsuspend_failed":"解禁此用户时发生了错误 {{error}}","suspend_duration":"该用户将被封禁多久？","suspend_duration_units":"（天）","suspend_reason_label":"为什么封禁该用户？该理由将公开显示在用户个人页面上，当其尝试登录时，也看到这条理由。尽量简洁。","suspend_reason":"封禁的理由","suspended_by":"封禁操作者：","delete_all_posts":"删除所有帖子","delete_all_posts_confirm":"你将删除 %{posts} 个帖子和 %{topics} 个主题，确认吗？","suspend":"禁止","unsuspend":"解禁","suspended":"已禁止？","moderator":"版主？","admin":"管理员？","blocked":"已封?","show_admin_profile":"管理员","edit_title":"编辑头衔","save_title":"保存头衔","refresh_browsers":"强制浏览器刷新","refresh_browsers_message":"消息发送至所有用户！","show_public_profile":"显示公开介绍","impersonate":"检视角度","ip_lookup":"IP 查询","log_out":"登出","logged_out":"用户在所有设备都已登出","revoke_admin":"吊销管理员资格","grant_admin":"赋予管理员资格","revoke_moderation":"吊销论坛版主资格","grant_moderation":"赋予论坛版主资格","unblock":"解封","block":"封号","reputation":"声誉","permissions":"权限","activity":"活动","like_count":"给出的赞 / 收到的赞","last_100_days":"在最近 100 天","private_topics_count":"私有主题数量","posts_read_count":"已阅帖子数量","post_count":"创建的帖子数量","topics_entered":"已查看的主题数量","flags_given_count":"所做报告数量","flags_received_count":"收到报告数量","warnings_received_count":"收到警告","flags_given_received_count":"给出的标记 / 收到的标记","approve":"批准","approved_by":"批准人","approve_success":"用户已被批准， 激活邮件已发送。","approve_bulk_success":"成功！所有选定的用户已批准并通知。","time_read":"阅读次数","anonymize":"匿名用户","anonymize_confirm":"你确定要匿名化该账户信息吗？这将改变用户名和邮件地址，并且重置所有个人主页信息。","anonymize_yes":"是的，匿名化该账户","anonymize_failed":"在匿名化该账户时遇到问题。","delete":"删除用户","delete_forbidden_because_staff":"不能删除管理员和版主。","delete_posts_forbidden_because_staff":"不能删除管理员和版主的所以帖子。","delete_forbidden":{"other":"用户如果有帖子将不能删除。在试图尝试删除一个用户前删除所有的帖子（%{count} 天前的帖子不能被删除）"},"cant_delete_all_posts":{"other":"不能删除所有帖子。一些帖子发表于 %{count} 天前。（设置项：delete_user_max_post_age）"},"cant_delete_all_too_many_posts":{"other":"不能删除所有帖子，因为用户有超过 %{count} 个帖子。（delete_all_posts_max）"},"delete_confirm":"你确定要删除这个用户吗？这个操作是不可逆的！","delete_and_block":"删除并\u003cb\u003e封禁\u003c/b\u003e该邮件地址和IP地址","delete_dont_block":"仅删除","deleted":"该用户已被删除。","delete_failed":"在删除用户时发生了错误。请确保删除该用户前删除了该用户的所有帖子。","send_activation_email":"发送激活邮件","activation_email_sent":"激活邮件已发送。","send_activation_email_failed":"在发送激活邮件时发生了错误。","activate":"激活帐号","activate_failed":"在激活用户帐号时发生了错误。","deactivate_account":"停用帐号","deactivate_failed":"在停用用户帐号时发生了错误。","unblock_failed":"在解除用户帐号封禁时发生了错误。","block_failed":"在封禁用户帐号时发生了错误。","deactivate_explanation":"已停用的用户必须重新验证他们的电子邮件。","suspended_explanation":"一个被封禁的用户不能登录。","block_explanation":"被封禁的用户不能发表主题或者评论。","trust_level_change_failed":"改变用户等级时出现了一个问题。","suspend_modal_title":"被禁用户","trust_level_2_users":"二级信任等级用户","trust_level_3_requirements":"三级信任等级需求","trust_level_locked_tip":"信任等级已经被锁定，系统将不会升降用户的信任等级","trust_level_unlocked_tip":"信任等级已经解锁，系统将自动升降用户的信任等级","lock_trust_level":"锁定信任等级","unlock_trust_level":"解锁信任等级","tl3_requirements":{"title":"3 级信任等级的需求","table_title":"在过去的 100 天中：","value_heading":"价值","requirement_heading":"需求","visits":"访问","days":"天数","topics_replied_to":"回复的主题","topics_viewed":"已读主题","topics_viewed_all_time":"已阅的主题 (全部)","posts_read":"已读帖子","posts_read_all_time":"已读的帖子 (全部)","flagged_posts":"被报告的帖子","flagged_by_users":"标记的用户","likes_given":"给出的赞","likes_received":"收到的赞","likes_received_days":"收到的赞：每天","likes_received_users":"收到的赞：每用户","qualifies":"符合等级3的信用度","does_not_qualify":"未符合等级3的信用度","will_be_promoted":"将在近期被提升。","will_be_demoted":"将在近期被降级。","on_grace_period":"目前在升级优惠阶段，将不会被降级。","locked_will_not_be_promoted":"信任等级被锁定。将不再被提升。","locked_will_not_be_demoted":"信任等级被锁定。将不再被降级。"},"sso":{"title":"单点登录","external_id":"外部 ID","external_username":"用户名","external_name":"名字","external_email":"电子邮件","external_avatar_url":"头像URL"}},"user_fields":{"title":"用户属性","help":"增加用户能填写的字段。","create":"创建用户属性 ","untitled":"无标题","name":"字段名称","type":"字段类型","description":"字段描述信息","save":"保存","edit":"编辑","delete":"删除","cancel":"取消","delete_confirm":"你确定要删除这个用户字段么？","options":"选项","required":{"title":"在注册时需要填写？","enabled":"必填","disabled":"可选"},"editable":{"title":"在注册后可以修改？","enabled":"可修改","disabled":"不可修改"},"show_on_profile":{"title":"在个人信息页显示？","enabled":"在个人信息页显示","disabled":"未在个人信息页显示"},"field_types":{"text":"文本字段","confirm":"确认","dropdown":"下拉菜单"}},"site_text":{"none":"选择一个内容类型开始编辑。","title":"文本内容"},"site_settings":{"show_overriden":"只显示修改过的","title":"设置","reset":"重置为默认","none":"无","no_results":"找不到结果。","clear_filter":"清除","add_url":"增加链接","add_host":"添加主机","categories":{"all_results":"全部","required":"必填","basic":"基本设置","users":"用户","posting":"发帖","email":"电子邮件","files":"文件","trust":"信任等级","security":"安全性","onebox":"Onebox","seo":"搜索引擎优化","spam":"垃圾信息","rate_limits":"频率限制","developer":"开发者","embedding":"嵌入","legal":"法律信息","uncategorized":"未分类","backups":"备份","login":"登录","plugins":"插件","user_preferences":"用户设置"}},"badges":{"title":"徽章","new_badge":"新徽章","new":"新建","name":"名称","badge":"徽章","display_name":"显示名称","description":"描述","badge_type":"徽章分类","badge_grouping":"群组","badge_groupings":{"modal_title":"徽章组"},"granted_by":"授予由","granted_at":"授予于","reason_help":"（一个至主题或帖子的链接）","save":"保存","delete":"删除","delete_confirm":"你确定要删除此徽章吗？","revoke":"撤销","reason":"理由","expand":"展开 \u0026hellip;","revoke_confirm":"你确定要撤销此徽章吗？","edit_badges":"编辑徽章","grant_badge":"授予徽章","granted_badges":"已授予的徽章","grant":"授予","no_user_badges":"%{name} 尚未被授予徽章。","no_badges":"没有可供授予的徽章。","none_selected":"选择一个徽章开始","allow_title":"允许将徽章用作头衔","multiple_grant":"能被授予多次","listable":"在公共徽章页面显示徽章","enabled":"启用徽章系统","icon":"图标","image":"图片","icon_help":"使用 Font Awesome class 或者图片的链接","query":"徽章查询（SQL）","target_posts":"查询到的帖子","auto_revoke":"每天运行撤销查询","show_posts":"在徽章页面显示被授予帖子的徽章","trigger":"开关","trigger_type":{"none":"每日更新","post_action":"当用户操作一个帖子时","post_revision":"当用户编辑或者创建帖子时","trust_level_change":"当用户信任等级改变时","user_change":"当用户被编辑或创建时"},"preview":{"link_text":"预览授予的徽章","plan_text":"预览查询计划","modal_title":"徽章查询预览","sql_error_header":"查询时出错。","error_help":"查看下列关于徽章查询的帮助链接。","bad_count_warning":{"header":"警告！","text":"有授予的样本消失。这在徽章查询返回用户 ID 或者帖子 ID 不存在的时候发生。这可能导致未预期的结果发生——请再次检查你的查询。"},"no_grant_count":"没有徽章可以被授予。","grant_count":{"other":"已授予 \u003cb\u003e%{count}\u003c/b\u003e 个徽章。"},"sample":"样本：","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e因 %{link} 帖子","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e因在\u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e时的 %{link} 帖子","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e在\u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"增加所有人可用的 emoji。（高端技巧：一次性拖进多个文件）","add":"增加新的 Emoji","name":"姓名","image":"图片","delete_confirm":"你确定要删除 :%{name}: emoji 么？"},"embedding":{"get_started":"如果你想要将 Discourse 嵌入至其他网站，添加他们的主机地址。","confirm_delete":"你确定要删除这个主机吗？","sample":"使用下列 HTML 代码至你的站点创建和嵌入 Discourse 主题。把\u003cb\u003eREPLACE_ME\u003c/b\u003e 替换成你将嵌入至的网址。","title":"嵌入","host":"允许的主机","edit":"编辑","category":"发布到分类","add_host":"增加主机","settings":"嵌入设置","feed_settings":"源设置","feed_description":"为你的站点提供一份 RSS/ATOM 源能改善 Discourse 导入你的内容的能力","crawling_settings":"爬虫设置","crawling_description":"当 Discourse 为你的帖子创建了主题时，如果没有 RSS/ATOM 流存在，它将尝试从 HTML 中解析内容。有时分离其中的内容时可能是很有挑战性的，所以我们提供了指定 CSS 规则的能力来帮助分离过程。","embed_by_username":"主题创建者的用户名","embed_post_limit":"嵌入的最大帖子数量。","embed_username_key_from_feed":"从流中拉取 Discourse 用户名的 Key ","embed_truncate":"截断嵌入的帖子","embed_whitelist_selector":"使用 CSS 选择器选择允许的嵌入元素","embed_blacklist_selector":"使用 CSS 选择器移除嵌入元素","feed_polling_enabled":"通过RSS/ATOM导入帖子","feed_polling_url":"用于抓取的 RSS/ATOM 流的 URL","save":"保存嵌入设置"},"permalink":{"title":"永久链接","url":"URL","topic_id":"主题 ID","topic_title":"主题","post_id":"帖子 ID","post_title":"帖子","category_id":"分类 ID","category_title":"分类","external_url":"外部 URL","delete_confirm":"你确定要删除该永久链接？","form":{"label":"新：","add":"添加","filter":"搜索（URL 或外部 URL）"}}},"lightbox":{"download":"下载"},"search_help":{"title":"搜索帮助"},"keyboard_shortcuts_help":{"title":"键盘快捷键","jump_to":{"title":"跳转","home":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003eh\u003c/b\u003e 主页","latest":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003el\u003c/b\u003e 最新内容","new":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003en\u003c/b\u003e 近期主题","unread":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003eu\u003c/b\u003e 未读主题","categories":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003ec\u003c/b\u003e 分类列表","top":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003et\u003c/b\u003e 顶部","bookmarks":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003eb\u003c/b\u003e 书签","profile":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003ep\u003c/b\u003e 个人页面","messages":"\u003cb\u003eg\u003c/b\u003e 然后 \u003cb\u003em\u003c/b\u003e 消息"},"navigation":{"title":"导航","jump":"\u003cb\u003e#\u003c/b\u003e 跳转到帖子 #","back":"\u003cb\u003eu\u003c/b\u003e 返回","up_down":"\u003cb\u003ek\u003c/b\u003e 或 \u003cb\u003ej\u003c/b\u003e 移动选择焦点 \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e 或者 \u003cb\u003eEnter\u003c/b\u003e 打开选中的主题","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e 或 \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e 下一个/前一个段落"},"application":{"title":"应用","create":"\u003cb\u003ec\u003c/b\u003e 创建一个新主题","notifications":"\u003cb\u003en\u003c/b\u003e 打开通知菜单","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e 打开汉堡菜单","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e 打开用户菜单","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e 显示更新过的主题","search":"\u003cb\u003e/\u003c/b\u003e 搜索","help":"\u003cb\u003e?\u003c/b\u003e 打开键盘快捷键帮助","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e 然后 \u003cb\u003er\u003c/b\u003e 解除新/帖子提示","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e 然后 \u003cb\u003et\u003c/b\u003e 解除主题提示","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e 登出"},"actions":{"title":"动作","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e 切换主题收藏状态","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e 置顶/截至置顶主题","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e 分享主题","share_post":"\u003cb\u003es\u003c/b\u003e 分享帖子","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e 回复为联结主题","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e 回复主题","reply_post":"\u003cb\u003er\u003c/b\u003e 回复帖子","quote_post":"\u003cb\u003eq\u003c/b\u003e 引用帖子","like":"\u003cb\u003el\u003c/b\u003e 赞帖子","flag":"\u003cb\u003e!\u003c/b\u003e 报告帖子","bookmark":"\u003cb\u003eb\u003c/b\u003e 给帖子添加书签","edit":"\u003cb\u003ee\u003c/b\u003e 编辑帖子","delete":"\u003cb\u003ed\u003c/b\u003e 删除帖子","mark_muted":"\u003cb\u003em\u003c/b\u003e 然后 \u003cb\u003em\u003c/b\u003e 免打扰主题","mark_regular":"\u003cb\u003em\u003c/b\u003e 然后 \u003cb\u003er\u003c/b\u003e 设为常规主题","mark_tracking":"\u003cb\u003em\u003c/b\u003e 然后 \u003cb\u003et\u003c/b\u003e 追踪主题","mark_watching":"\u003cb\u003em\u003c/b\u003e 然后 \u003cb\u003ew\u003c/b\u003e 关注主题"}},"badges":{"title":"徽章","allow_title":"能用作头衔","multiple_grant":"能被授予多次","badge_count":{"other":"%{count} 个徽章"},"more_badges":{"other":"+%{count} 更多"},"granted":{"other":"%{count} 个已授予"},"select_badge_for_title":"选择一个徽章用作你的头衔","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"开始"},"community":{"name":"社群"},"trust_level":{"name":"信任等级"},"other":{"name":"其它"},"posting":{"name":"发帖"}},"badge":{"editor":{"name":"编辑","description":"首个帖子编辑"},"basic_user":{"name":"基础","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003e授予\u003c/a\u003e所有常用社群功能"},"member":{"name":"成员","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003e已授予\u003c/a\u003e邀请权限"},"regular":{"name":"活跃用户","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003e已授予\u003c/a\u003e重分类、重命名、跟踪链接和贵宾室"},"leader":{"name":"领导","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003e已授予\u003c/a\u003e 全局编辑、固定、关闭、存档、分割和合并"},"welcome":{"name":"欢迎","description":"得到一个赞"},"autobiographer":{"name":"自传作者","description":"已填写用户\u003ca href=\"/my/preferences\"\u003e资料\u003c/a\u003e信息"},"anniversary":{"name":"年度纪念日","description":"一年活跃用户，至少发了一个帖子"},"nice_post":{"name":"不错的帖子","description":"一个帖子收到 10 个赞。这个徽章可以被授予多次"},"good_post":{"name":"实用的帖子","description":"一个帖子收到 25 个赞。这个徽章可以被授予多次"},"great_post":{"name":"非常棒的帖子","description":"一个帖子收到 50 个赞。这个徽章可以被授予多次"},"nice_topic":{"name":"好的主题","description":"一个帖子收到 10 个赞。这个徽章可以被授予多次"},"good_topic":{"name":"不错的主题","description":"一个帖子收到 25 个赞。这个徽章可以被授予多次"},"great_topic":{"name":"很棒的主题","description":"一个帖子收到 50 个赞。这个徽章可以被授予多次"},"nice_share":{"name":"分享得很好","description":"分享了一个有 25 个独立访问者的帖子"},"good_share":{"name":"分享得不错","description":"分享了一个有 300 个独立访问者的帖子"},"great_share":{"name":"分享得很好","description":"分享了一个有 1000 个独立访问者的帖子"},"first_like":{"name":"首个赞","description":"已赞了一个帖子"},"first_flag":{"name":"首个标记","description":"标记帖子"},"promoter":{"name":"推广","description":"已邀请了 1 个用户"},"campaigner":{"name":"资深推广","description":"邀请3个基础用户（信任等级1）"},"champion":{"name":"元老推广","description":"邀请5个会员（信任等级2）"},"first_share":{"name":"首次分享","description":"已分享了一个帖子"},"first_link":{"name":"首个链接","description":"已经添加了一个内部链接至另一个主题"},"first_quote":{"name":"第一次引用","description":"引用了一个用户"},"read_guidelines":{"name":"阅读指引","description":"阅读\u003ca href=\"/guidelines\"\u003e社群指引\u003c/a\u003e"},"reader":{"name":"读者","description":"阅读一个超过 100 个帖子的主题中的每一个帖子"},"popular_link":{"name":"流行链接","description":"发布了超过 50 次点击的外部链接"},"hot_link":{"name":"热门链接","description":"发布了超过 300 次点击的外部链接"},"famous_link":{"name":"著名链接","description":"发布了超过 1000 次点击的外部链接"}}},"google_search":"\u003ch3\u003e用 Google 搜索\u003c/h3\u003e\n\u003cp\u003e\n\u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n\u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n\u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n\u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n\u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"number":{"human":{"storage_units":{"units":{"byte":{"one":"Byte"}}}}},"dates":{"tiny":{"less_than_x_seconds":{"one":"\u003c 1s"},"x_seconds":{"one":"1s"},"less_than_x_minutes":{"one":"\u003c 1m"},"x_minutes":{"one":"1m"},"about_x_hours":{"one":"1h"},"x_days":{"one":"1d"},"about_x_years":{"one":"1y"},"over_x_years":{"one":"\u003e 1y"},"almost_x_years":{"one":"1y"}},"medium":{"x_minutes":{"one":"1 min"},"x_hours":{"one":"1 hour"},"x_days":{"one":"1 day"}},"medium_with_ago":{"x_minutes":{"one":"1 min ago"},"x_hours":{"one":"1 hour ago"},"x_days":{"one":"1 day ago"}},"later":{"x_days":{"one":"1 day later"},"x_months":{"one":"1 month later"},"x_years":{"one":"1 year later"}}},"links_lowercase":{"one":"link"},"character_count":{"one":"{{count}} character"},"topic_count_latest":{"one":"{{count}} new or updated topic."},"topic_count_unread":{"one":"{{count}} unread topic."},"topic_count_new":{"one":"{{count}} new topic."},"queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval"},"approval":{"pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending."}}},"directory":{"total_rows":{"one":"1 user"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"title":{"one":"group"}},"categories":{"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}."}},"user":{"messages":{"groups":"My Groups"},"email":{"frequency":{"one":"We'll only email you if we haven't seen you in the last minute."}},"invited":{"truncated":{"one":"Showing the first invite."}}},"replies_lowercase":{"one":"reply"},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"search":{"result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"topics":{"bulk":{"selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic."}}},"topic":{"new_topics":{"one":"1 new topic"},"unread_topics":{"one":"1 unread topic"},"total_unread_posts":{"one":"you have 1 unread post in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","feature_topic":{"already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e"},"already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e"}},"controls":"Topic Controls","filters":{"n_posts":{"one":"1 post"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post."}}},"post":{"deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)"},"gap":{"one":"view 1 hidden reply"},"has_replies":{"one":"{{count}} Reply"},"has_likes":{"one":"{{count}} Like"},"has_likes_title":{"one":"1 person liked this post"},"has_likes_title_you":{"one":"you and 1 other person liked this post"},"controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?"}}},"actions":{"defer_flags":{"one":"Defer flag"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post"},"like":{"one":"You and 1 other liked this"},"vote":{"one":"You and 1 other voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post"},"like":{"one":"1 person liked this"},"vote":{"one":"1 person voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?"}}},"topic_map":{"clicks":{"one":"1 click"}},"views_lowercase":{"one":"view"},"likes_lowercase":{"one":"like"},"users_lowercase":{"one":"user"},"filters":{"latest":{"title_with_count":{"one":"Latest (1)"}},"unread":{"title_with_count":{"one":"Unread (1)"},"lower_title_with_count":{"one":"1 unread"}},"new":{"lower_title_with_count":{"one":"1 new"},"title_with_count":{"one":"New (1)"}},"category":{"title_with_count":{"one":"{{categoryName}} (1)"}}},"poll":{"voters":{"one":"voter"},"total_votes":{"one":"total vote"},"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"flags":{"summary":{"action_type_3":{"one":"off-topic"},"action_type_4":{"one":"inappropriate"},"action_type_6":{"one":"custom"},"action_type_7":{"one":"custom"},"action_type_8":{"one":"spam"}}},"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"users":{"approved_selected":{"one":"approve user"},"reject_selected":{"one":"reject user"},"reject_successful":{"one":"Successfully rejected 1 user."},"reject_failures":{"one":"Failed to reject 1 user."}},"user":{"delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"badges":{"preview":{"grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned."}}}},"badges":{"badge_count":{"one":"1 Badge"},"more_badges":{"one":"+1 More"},"granted":{"one":"1 granted"}}}}};
I18n.locale = 'zh_CN';
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
// moment.js language configuration
// language : chinese
// author : suupic : https://github.com/suupic

moment.lang('zh-cn', {
    months : "一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),
    monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
    weekdays : "星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),
    weekdaysShort : "周日_周一_周二_周三_周四_周五_周六".split("_"),
    weekdaysMin : "日_一_二_三_四_五_六".split("_"),
    longDateFormat : {
        LT : "Ah点mm",
        L : "YYYY年MMMD日",
        LL : "YYYY年MMMD日",
        LLL : "YYYY年MMMD日LT",
        LLLL : "YYYY年MMMD日ddddLT",
        l : "YYYY年MMMD日",
        ll : "YYYY年MMMD日",
        lll : "YYYY年MMMD日LT",
        llll : "YYYY年MMMD日ddddLT"
    },
    meridiem : function (hour, minute, isLower) {
        if (hour < 9) {
            return "早上";
        } else if (hour < 11 && minute < 30) {
            return "上午";
        } else if (hour < 13 && minute < 30) {
            return "中午";
        } else if (hour < 18) {
            return "下午";
        } else {
            return "晚上";
        }
    },
    calendar : {
        sameDay : '[今天]LT',
        nextDay : '[明天]LT',
        nextWeek : '[下]ddddLT',
        lastDay : '[昨天]LT',
        lastWeek : '[上]ddddLT',
        sameElse : 'L'
    },
    ordinal : function (number, period) {
        switch (period) {
        case "d" :
        case "D" :
        case "DDD" :
            return number + "日";
        case "M" :
            return number + "月";
        case "w" :
        case "W" :
            return number + "周";
        default :
            return number;
        }
    },
    relativeTime : {
        future : "%s内",
        past : "%s前",
        s : "几秒",
        m : "1分钟",
        mm : "%d分钟",
        h : "1小时",
        hh : "%d小时",
        d : "1天",
        dd : "%d天",
        M : "1个月",
        MM : "%d个月",
        y : "1年",
        yy : "%d年"
    }
});

moment.fn.shortDateNoYear = function(){ return this.format('MMMDo'); };
moment.fn.shortDate = function(){ return this.format('ll'); };
moment.fn.longDate = function(){ return this.format('lll'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
