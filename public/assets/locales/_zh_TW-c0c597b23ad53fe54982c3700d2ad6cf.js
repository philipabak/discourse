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
MessageFormat.locale.zh_TW = function ( n ) {
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
    })({});I18n.translations = {"zh_TW":{"js":{"number":{"human":{"storage_units":{"format":"%n %u","units":{"byte":{"other":"位元組"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}}},"dates":{"time":"h:mm","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","long_with_year":"YYYY MMM D h:mm a","long_with_year_no_time":"YYYY MMM D","long_date_with_year":"'YY MMM D LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"'YY MMM D","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"'YY MMM D\u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1 分鐘","less_than_x_seconds":{"other":"\u003c %{count} 秒"},"x_seconds":{"other":"%{count} 秒"},"less_than_x_minutes":{"other":"\u003c %{count} 分鐘"},"x_minutes":{"other":"%{count} 分鐘"},"about_x_hours":{"other":"%{count} 小時"},"x_days":{"other":"%{count} 天"},"about_x_years":{"other":"%{count} 年"},"over_x_years":{"other":"\u003e %{count} 年"},"almost_x_years":{"other":"%{count} 年"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"other":"%{count} 分鐘"},"x_hours":{"other":"%{count} 小時"},"x_days":{"other":"%{count} 天"},"date_year":"'YY MMM D"},"medium_with_ago":{"x_minutes":{"other":"%{count} 分鐘前"},"x_hours":{"other":"%{count} 小時前"},"x_days":{"other":"%{count} 天前"}},"later":{"x_days":{"other":"%{count} 天後"},"x_months":{"other":"%{count} 個月後"},"x_years":{"other":"%{count} 年後"}}},"share":{"topic":"在此話題內分享連結","post":"文章 #%{postNumber}","close":"關閉","twitter":"在 Twitter 分享此連結","facebook":"在 Facebook 分享此連結","google+":"在 Google+ 分享此連結","email":"以電子郵件分享此連結"},"topic_admin_menu":"討論話題管理員操作","emails_are_disabled":"管理員已經停用了所有外寄郵件功能。通知信件都不會寄出。","edit":"編輯此討論話題的標題與分類","not_implemented":"抱歉，此功能尚未開放。","no_value":"否","yes_value":"是","generic_error":"抱歉，發生錯誤。","generic_error_with_reason":"發生錯誤: %{error}","sign_up":"註冊","log_in":"登入","age":"已建立","joined":"加入時間","admin_title":"管理員","flags_title":"投訴","show_more":"顯示更多","links":"連結","links_lowercase":{"other":"鏈結"},"faq":"常見問答集","guidelines":"守則","privacy_policy":"隱私政策","privacy":"隱私政策","terms_of_service":"服務條款","mobile_view":"手機版網站","desktop_view":"電腦版網站","you":"你","or":"或","now":"剛才","read_more":"閱讀更多","more":"更多","less":"較少","never":"永不","daily":"每天","weekly":"每週","every_two_weeks":"每兩週","every_three_days":"每三天","max_of_count":"（最大 {{count}}）","alternation":"或者","character_count":{"other":"{{count}} 個字"},"suggested_topics":{"title":"推薦的討論話題"},"about":{"simple_title":"關於","title":"關於%{title}","stats":"網站數據","our_admins":"我們的管理員","our_moderators":"我們的版主","stat":{"all_time":"所有時間","last_7_days":"最近 7 天","last_30_days":"最近 30 天"},"like_count":"讚","topic_count":"討論話題","post_count":"文章","user_count":"新用戶","active_user_count":"啟用的用戶","contact":"聯絡我們","contact_info":"當網站發生嚴重錯誤或緊急事件，請聯絡我們 %{contact_info}"},"bookmarked":{"title":"書籤","clear_bookmarks":"清除書籤","help":{"bookmark":"將此主題的第一篇文章加入書籤","unbookmark":"移除此主題所有書籤"}},"bookmarks":{"not_logged_in":"抱歉，你必須先登入才能將文章加上書籤","created":"你已將此文章加上書籤","not_bookmarked":"你已閱讀過這篇文章，按此加上書籤","last_read":"這是你最後閱讀的文章，按此加上書籤","remove":"移除書籤","confirm_clear":"你確定要刪除該主題的所有書籤嗎？"},"topic_count_latest":{"other":"有 {{count}} 個更新過或是新的討論話題。"},"topic_count_unread":{"other":"{{count}} 個未讀討論話題"},"topic_count_new":{"other":"有 {{count}} 個新討論話題。"},"click_to_show":"點擊顯示","preview":"預覽","cancel":"取消","save":"儲存變更","saving":"正在儲存...","saved":"儲存完畢！","upload":"上傳","uploading":"正在上傳...","uploaded":"上傳完畢！","enable":"啟用","disable":"停用","undo":"復原","revert":"回復","failed":"失敗","switch_to_anon":"匿名模式","banner":{"close":"關閉此橫幅"},"choose_topic":{"none_found":"未找到任何討論話題。","title":{"search":"以名稱、URL 或 ID 搜尋討論話題:","placeholder":"請在這裡輸入討論標題"}},"queue":{"topic":"話題：","approve":"批准","reject":"拒絕","delete_user":"刪除用戶","title":"需要被確認","none":"沒有要回顧的文章。","edit":"編輯","cancel":"取消","view_pending":"觀看等待審核的貼文","confirm":"儲存變更","delete_prompt":"您確定要刪除 \u003cb\u003e%{username}\u003c/b\u003e 這個帳號嗎？這會同時將該帳號的所有貼文一併刪除，並封鎖他的電子郵件與 IP。","approval":{"title":"貼文需等待審核","description":"貼文已經送出，但必須等待管理者審核過後才會出現在板上，請耐心等候。","pending_posts":{"other":"你有 \u003cstrong\u003e{{count}}\u003c/strong\u003e 篇貼文在等待審核中"},"ok":"確定"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 建立了 \u003ca href='{{topicUrl}}'\u003e此討論話題\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 建立了 \u003ca href='{{topicUrl}}'\u003e此討論話題\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 回覆了 \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 回覆了 \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e 回覆了 \u003ca href='{{topicUrl}}'\u003e此討論話題\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e 回覆了 \u003ca href='{{topicUrl}}'\u003e此討論話題\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e你\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003e你\u003c/a\u003e 提到了 \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"作者為 \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"作者為 \u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e","sent_by_user":"寄件者為 \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"寄件者為 \u003ca href='{{userUrl}}'\u003e你\u003c/a\u003e"},"directory":{"filter_name":"通過用戶名過濾","title":"用戶","likes_given":"送出的","likes_received":"收到的","topics_entered":"已讀","topics_entered_long":"已閱讀的討論話題","time_read":"閱讀多少次","topic_count":"話題","topic_count_long":"討論話題已建立","post_count":"回覆","post_count_long":"回覆貼文","no_results":"未找到任何結果。","days_visited":"訪問","days_visited_long":"到訪天數","posts_read":"已讀","posts_read_long":"讀過的文章","total_rows":{"other":"%{count} 用戶"}},"groups":{"visible":"群組可被所有用戶看到","title":{"other":"群組"},"members":"成員","posts":"文章","alias_levels":{"title":"誰能用此群組作為別名?","nobody":"沒有","only_admins":"只有管理員","mods_and_admins":"只有板主以及管理員","members_mods_and_admins":"只有群組成員、板主以及管理員","everyone":"所有人"},"trust_levels":{"none":"無"}},"user_action_groups":{"1":"已按讚","2":"已收到的讚","3":"書籤","4":"討論話題","5":"回覆","6":"回應","7":"提到","9":"引用","10":"收藏","11":"編輯","12":"送出的項目","13":"收件匣","14":"等待中"},"categories":{"all":"所有分類","all_subcategories":"所有","no_subcategory":"無","category":"分類","posts":"貼文","topics":"標題","latest":"最近","latest_by":"最近由","toggle_ordering":"顯示/隱藏排序控制","subcategories":"次分類","topic_stats":"新討論話題的數目。","topic_stat_sentence":{"other":"在過去一%{unit}內有 %{count} 個新討論話題。"},"post_stats":"新文章的數目。","post_stat_sentence":{"other":"在過去一%{unit}內有 %{count} 篇新文章。"}},"ip_lookup":{"title":"最近的 IP 位址","hostname":"伺服器名稱","location":"位置","location_not_found":"(unknown)","organisation":"組織","phone":"電話","other_accounts":"其他帳號正在使用相同 IP 地址","delete_other_accounts":"刪除 %{count}","username":"用戶名稱","trust_level":"TL","read_time":"閱讀時間","topics_entered":"已閱讀的討論話題","post_count":"# 文章","confirm_delete_other_accounts":"你確定要刪除這些帳號?"},"user":{"said":"{{username}}：","profile":"基本資料","mute":"靜音","edit":"編輯喜好設定","download_archive":"下載我的文章","new_private_message":"新訊息","private_message":"訊息","private_messages":"訊息","activity_stream":"活動","preferences":"偏好設定","expand_profile":"展開","bookmarks":"書籤","bio":"關於我","invited_by":"邀請人","trust_level":"信任等級","notifications":"通知","desktop_notifications":{"label":"桌面通知","not_supported":"非常遺憾，你的瀏覽器不支持桌面通知。","perm_default":"啟用桌面通知","perm_denied_btn":"權限被拒絕","disable":"停用通知","currently_enabled":"(當前已啟用)","enable":"啟用通知","currently_disabled":"(當前已關閉)"},"dismiss_notifications":"全部標記為已讀","dismiss_notifications_tooltip":"標記所有未讀通知為已讀","disable_jump_reply":"不要在回覆之後直接跳到我的文章","dynamic_favicon":"在瀏覽器小圖示上顯示新主題/更新的主題數","edit_history_public":"讓其他用戶檢視我的文章修訂紀錄","external_links_in_new_tab":"以新分頁開啟所有外部連結","enable_quoting":"允許引用已標註的文字","change":"修改","moderator":"{{user}} 是板主","admin":"{{user}} 是管理員","moderator_tooltip":"此用戶為板主","admin_tooltip":"此用戶為管理員","blocked_tooltip":"此用戶被屏蔽","suspended_notice":"此用戶已被停權至 {{date}}。","suspended_reason":"原因: ","github_profile":"Github","mailing_list_mode":"每當有新文章時，寄給我郵件通知。(除非我將該討論話題或分類設為靜音)","watched_categories":"關注","tracked_categories":"追蹤","muted_categories":"靜音","delete_account":"刪除我的帳號","delete_account_confirm":"你真的要刪除帳號嗎?此動作不能被還原!","deleted_yourself":"你的帳號已成功刪除","delete_yourself_not_allowed":"帳號不能刪除。請聯絡管理人。","unread_message_count":"訊息","admin_delete":"刪除","users":"用戶","muted_users":"靜音","muted_users_instructions":"禁止來自這些用戶的所有通知。","staff_counters":{"flags_given":"有幫助的投訴","flagged_posts":"已投訴的文章","deleted_posts":"已刪除的文章","suspensions":"停權","warnings_received":"警告"},"messages":{"all":"全部","mine":"我的","unread":"未讀"},"change_password":{"success":"( 寄出的郵件 )","in_progress":"( 正在傳送郵件 )","error":"( 錯誤 )","action":"寄出重設密碼的郵件","set_password":"設定密碼"},"change_about":{"title":"修改關於我"},"change_username":{"title":"修改用戶名稱","confirm":"如果你修改了你的用戶名稱，之前引用你的文章或以 @用戶名稱 提到你的連結都將失效，你確定要修改嗎？","taken":"抱歉，此用戶名稱已經有人使用。","error":"修改你的用戶名稱時發生錯誤。","invalid":"此用戶名稱無效，只能使用數字與英文字母。"},"change_email":{"title":"修改電子郵件地址","taken":"抱歉，此電子郵件地址無效。","error":"修改你的電子郵件地址時發生錯誤，可能此電子郵件地址已經有人使用?","success":"我們已經寄出一封郵件至此電子郵件地址，請遵照說明進行確認。"},"change_avatar":{"title":"設定個人資料圖片","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, based on","gravatar_title":"在 Gravatar 網站修改你的頭像","refresh_gravatar_title":"重新整理你的 Gravatar 頭像","letter_based":"系統分配的個人資料圖片","uploaded_avatar":"自訂圖片","uploaded_avatar_empty":"新增一張自訂圖片","upload_title":"上傳你的圖片","upload_picture":"上傳圖片","image_is_not_a_square":"警告：我們裁切了你的圖片，因為該圖片不是正方形的。"},"change_profile_background":{"title":"基本資料背景圖案","instructions":"個人資料背景會被置中，且默認寬度為850px。"},"change_card_background":{"title":"用戶卡背景","instructions":"背景會被置中，且默認寬度為850px。"},"email":{"title":"電子郵件","instructions":"我們不會公開您的電子郵件信箱。","ok":"我們將寄一封確認郵件給您。","invalid":"請輸入有效的電子郵件地址。","authenticated":"你的 Email 已由 {{provider}} 驗證完成。"},"name":{"title":"名稱","instructions":"您的全名 (選填)。","instructions_required":"您的匿稱","too_short":"你的匿稱太短。","ok":"你的匿稱符合要求。"},"username":{"title":"用戶名稱","instructions":"獨一無二，沒有空白，夠短。","short_instructions":"其他人可以輸入 @{{username}} 提到你。","available":"你的用戶名稱可以使用。","global_match":"電子郵件地址與註冊的用戶名稱相符。","global_mismatch":"已經註冊過了，請試試看 {{suggestion}}？","not_available":"無法使用，請試試看 {{suggestion}}？","too_short":"你的用戶名稱太短。","too_long":"你的用戶名稱太長。","checking":"正在檢查用戶名稱是否已經有人使用...","enter_email":"找到用戶名稱，請輸入相符的電子郵件地址。","prefilled":"電子郵件地址與此註冊的用戶名稱相符。"},"locale":{"title":"界面語言","instructions":"使用者介面的語言，當頁面重新整理的時候會更換成你的設定。","default":"(default)"},"password_confirmation":{"title":"再次輸入密碼"},"last_posted":"最近發表","last_emailed":"最近寄出電子郵件","last_seen":"出現時間","created":"建立日期","log_out":"登出","location":"位置","card_badge":{"title":"用戶卡徽章"},"website":"網站","email_settings":"電子郵件","email_digests":{"title":"當我很久沒來此網站時，以電子郵件通知我最近有什麼新文章：","daily":"每天","every_three_days":"每三天","weekly":"每週","every_two_weeks":"每兩星期"},"email_direct":"當有人引用、回覆我的發文，或以 @用戶名稱 提到我時，請以電子郵件通知我。","email_private_messages":"當有人寄給我私人訊息時，以電子郵件通知我。","other_settings":"其它","categories_settings":"分類","new_topic_duration":{"label":"視為新討論話題的條件","not_viewed":"我未看過的討論","last_here":"我上次到訪後的討論","after_1_day":"昨天發佈的討論","after_2_days":"過去兩天發佈的討論","after_1_week":"過去一週發佈的討論","after_2_weeks":"過去兩週發佈的討論"},"auto_track_topics":"自動追蹤我參與的討論","auto_track_options":{"never":"永不","immediately":"立即","after_30_seconds":"30 秒後","after_1_minute":"一分鐘後","after_2_minutes":"兩分鐘後","after_3_minutes":"三分鐘後","after_4_minutes":"四分鐘後","after_5_minutes":"五分鐘後","after_10_minutes":"十分鐘後"},"invited":{"search":"輸入要搜尋邀請的文字...","title":"邀請","user":"受邀請的用戶","sent":"送出","redeemed":"已接受的邀請","redeemed_at":"接受日期","pending":"尚未接受的邀請","topics_entered":"參與的討論話題","posts_read_count":"已讀的文章","expired":"此邀請已過期","rescind":"移除","rescinded":"邀請已刪除","reinvite":"重送邀請","reinvited":"邀請已經重送","time_read":"閱讀時間","days_visited":"到訪天數","account_age_days":"帳號已建立 (天)","create":"送出邀請","generate_link":"拷貝邀請連結","bulk_invite":{"none":"你尚未邀請任何人。你可以發送個別邀請，或者透過\u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003e上傳邀請名單\u003c/a\u003e一次邀請一群人。","text":"從檔案大量邀請","uploading":"正在上傳...","success":"檔案已上傳成功，處理完畢後將以私人訊息通知你。","error":"上傳 '{{filename}}' 時發生問題：{{message}}"}},"password":{"title":"密碼","too_short":"你的密碼太短。","common":"此密碼太簡單。","same_as_username":"密碼與使用者名稱相同","same_as_email":"你的密碼與電郵相同。","ok":"你的密碼符合要求。","instructions":"至少 %{count} 個字。"},"associated_accounts":"登入","ip_address":{"title":"最近的 IP 位址"},"registration_ip_address":{"title":"註冊之 IP 位址"},"avatar":{"title":"個人資料圖片"},"title":{"title":"標題"},"filters":{"all":"全部"},"stream":{"posted_by":"發表者","sent_by":"寄件者","private_message":"訊息","the_topic":"討論話題"}},"loading":"正在載入","errors":{"prev_page":"當嘗試載入","reasons":{"network":"網絡錯誤","server":"伺服器錯誤","forbidden":"拒絕存取","unknown":"錯誤"},"desc":{"network":"請檢查你的網絡連線。","network_fixed":"似乎沒有問題了","server":"錯誤代碼：{{status}}","forbidden":"你不允許瀏覽此處。","unknown":"發生錯誤。"},"buttons":{"back":"返回","again":"請再試一次","fixed":"載入頁面"}},"close":"關閉","assets_changed_confirm":"此網站剛剛已更新，你要重整頁面以獲得最新版本嗎？","logout":"已登出","refresh":"重新整理","read_only_mode":{"enabled":"管理員開啟了唯讀模式。你可以繼續瀏覽網站，但一些互動功能可能無法使用。","login_disabled":"在唯讀模式下不能登入"},"learn_more":"進一步了解...","year":"年","year_desc":"最近 365 天內建立的討論話題","month":"月","month_desc":"最近 30 天內建立的討論話題","week":"週","week_desc":"最近 7 天內建立的討論話題","day":"天","first_post":"第一篇文章","mute":"靜音","unmute":"取消靜音","last_post":"最後一篇文章","last_reply_lowercase":"最新回覆","replies_lowercase":{"other":"回覆"},"summary":{"enabled_description":"你正在檢視此討論話題的摘要：在這個社群裡最熱門的文章。","description":"共有 \u003cb\u003e{{count}}\u003c/b\u003e 個回覆。","description_time":"共有 \u003cb\u003e{{count}}\u003c/b\u003e 個回覆，大約需要 \u003cb\u003e{{readingTime}} 分鐘\u003c/b\u003e閱讀。","enable":"以摘要檢視此討論話題","disable":"顯示所有文章"},"deleted_filter":{"enabled_description":"這個討論話題含有被刪除的回覆，這些回覆已被隱藏。","disabled_description":"討論話題內刪除的回復已被顯示。","enable":"隱藏已刪除的文章","disable":"顯示已刪除的文章"},"private_message_info":{"title":"訊息","invite":"邀請其他人..."},"email":"電子郵件","username":"用戶名稱","last_seen":"出現時間","created":"已建立","created_lowercase":"已建立","trust_level":"信任等級","search_hint":"使用者名稱、電子郵件、或是IP位址","create_account":{"title":"建立新帳號","failed":"發生了某些錯誤，可能此電子郵件地址已經註冊過，請試試看忘記密碼連結"},"forgot_password":{"title":"寄出密碼","action":"我忘了我的密碼","invite":"請輸入用戶名稱或電子郵件地址，我們將寄給你重設密碼的郵件。","reset":"重設密碼","complete_username":"如果有帳號符合你輸入的用戶名稱 \u003cb\u003e%{username}\u003c/b\u003e，你應該很快就會收到重設密碼的電子郵件。","complete_email":"如果有帳號符合你輸入的電子郵件地址 \u003cb\u003e%{email}\u003c/b\u003e，你應該很快就會收到重設密碼的電子郵件。","complete_username_found":"我們發現有個帳號跟你所提供的用戶名稱 \u003cb\u003e%{username}\u003c/b\u003e 相符，你應該很快就會收到重設密碼的電子郵件。","complete_email_found":"我們發現有個帳號跟 \u003cb\u003e%{email}\u003c/b\u003e 相符，你應該很快就會收到重設密碼的電子郵件。","complete_username_not_found":"沒有帳號使用 \u003cb\u003e%{username}\u003c/b\u003e 這個用戶名稱","complete_email_not_found":"沒有帳號使用 \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"登入","username":"用戶","password":"密碼","email_placeholder":"電子郵件地址或用戶名稱","caps_lock_warning":"大寫鎖定中","error":"未知的錯誤","blank_username_or_password":"請輸入你的電子郵件或者用戶名稱，以及密碼。","reset_password":"重設密碼","logging_in":"登入中...","or":"或","authenticating":"正在認證...","awaiting_confirmation":"你的帳號尚未啟用，請使用忘記密碼連結重新發出啟用帳號的電子郵件。","awaiting_approval":"你的帳號尚未通過工作人員的審核，當審核通過時你會收到電子郵件通知。","requires_invite":"抱歉，只有受邀請者才能進入此論壇。","not_activated":"你還無法登入，我們之前曾將啟用帳號的電子郵件寄至 \u003cb\u003e{{sentTo}}\u003c/b\u003e，請從該電子郵件啟用你的帳號。","not_allowed_from_ip_address":"你無法透過此 IP 登入。","admin_not_allowed_from_ip_address":"你無法透過此 IP 登入成為管理員。","resend_activation_email":"按這裡重新寄出啟用帳號的電子郵件。","sent_activation_email_again":"我們已經將啟用帳號的電子郵件寄至 \u003cb\u003e{{currentEmail}}\u003c/b\u003e，你可能幾分鐘後才會收到，如果一直沒收到，請檢查垃圾郵件資料夾。","google":{"title":"使用 Google 帳號","message":"使用 Google 帳號認証 (請確定你的網頁瀏覽器未阻擋彈出視窗)"},"google_oauth2":{"title":"使用 Google 帳號","message":"使用 Google 帳號認證 ( 請確定你的網頁瀏覽器不會阻擋彈出視窗 )"},"twitter":{"title":"使用 Twitter","message":"使用 Twitter 認証 (請確定你的網頁瀏覽器未阻擋彈出視窗)"},"facebook":{"title":"使用 Facebook","message":"使用 Facebook 認証 (請確定你的網頁瀏覽器未阻擋彈出視窗)"},"yahoo":{"title":"使用 Yahoo","message":"使用 Yahoo 認証 (請確定你的網頁瀏覽器未阻擋彈出視窗)"},"github":{"title":"使用 GitHub","message":"使用 GitHub 認証 (請確定你的網頁瀏覽器未阻擋彈出視窗)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","composer":{"emoji":"Emoji :smile:","whisper":"密談","add_warning":"這是正式警告。","toggle_whisper":"切換密談","posting_not_on_topic":"你想要回覆哪個討論話題?","saving_draft_tip":"正在儲存...","saved_draft_tip":"儲存完畢","saved_local_draft_tip":"本地儲存完畢","similar_topics":"與你的討論話題類似的討論...","drafts_offline":"離線草稿","error":{"title_missing":"標題為必填欄位","title_too_short":"標題必須至少 {{min}} 個字","title_too_long":"標題不能超過 {{max}} 個字","post_missing":"文章不可空白","post_length":"文章必須至少 {{min}} 個字。","category_missing":"你必須選擇一個分類。"},"save_edit":"儲存編輯","reply_original":"回覆至原始的討論話題","reply_here":"在此回覆","reply":"回覆","cancel":"取消","create_topic":"建立討論話題","create_pm":"訊息","title":"或者按 Ctrl+Enter","users_placeholder":"新增用戶","title_placeholder":"用一個簡短的句子來描述想討論的內容。","edit_reason_placeholder":"你為什麼做編輯?","show_edit_reason":"(請加入編輯原因)","view_new_post":"檢視你的新文章。","saved":"儲存完畢!","saved_draft":"草稿待完成，點擊繼續。","uploading":"正在上傳...","show_preview":"顯示預覽 \u0026raquo;","hide_preview":"\u0026laquo; 隱藏預覽","quote_post_title":"引用完整文章","bold_title":"粗體","bold_text":"粗體字","italic_title":"斜體","italic_text":"斜體字","link_title":"超連結","link_description":"在此輸入超連結的描述","link_dialog_title":"插入超連結","link_optional_text":"標題 (可選填)","quote_title":"引用","quote_text":"引用","code_title":"預先格式化文字","code_text":"以 4 格空白將預先格式的化文字縮排","upload_title":"上傳","upload_description":"在此輸入上傳的描述","olist_title":"編號清單","ulist_title":"符號清單","list_item":"清單項目","heading_title":"標頭","heading_text":"標頭","hr_title":"分隔線","help":"Markdown 編輯說明","toggler":"隱藏或顯示編輯面板","admin_options_title":"此討論話題可選用之工作人員設定選項","auto_close":{"label":"自動關閉主題時間：","error":"請輸入一個有效值。","based_on_last_post":"在最後一個文章發表後，暫不關閉主題的時間。","all":{"examples":"輸入小時數（24）、絕對時間（17:30）、或時間戳（2013-11-22 14:00）。"},"limited":{"units":"（# 小時數）","examples":"輸入小時數（24）"}}},"notifications":{"title":"當有人以「@用戶名稱」提及您、回覆您的貼文、或是傳送訊息給您的時候通知您的設定。","none":"目前無法載入通知訊息。","more":"檢視較舊的通知","total_flagged":"所有被投訴的文章","mentioned":"\u003ci title='被提到' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e已接受你的邀請\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e 移動了 {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e獲得徽章「{{description}}」\u003c/p\u003e","alt":{"linked":"連結到你的討論"}},"upload_selector":{"title":"加入一張圖片","title_with_attachments":"加入一張圖片或一個檔案","from_my_computer":"從我的電腦","from_the_web":"從網站","remote_tip":"圖片連結","hint":"(你也可以將檔案拖放至編輯器直接上傳)","uploading":"正在上傳","select_file":"選取檔案","image_link":"連結你的圖片將指向"},"search":{"title":"搜尋討論話題、文章、用戶或分類","no_results":"未找到任何結果。","search_help":"搜尋幫助","searching":"正在搜尋...","post_format":"#{{post_number}} {{username}}","context":{"user":"搜尋 @{{username}} 的文章","category":"搜尋 \"{{category}}\" 分類","topic":"搜尋此討論話題"}},"go_back":"返回","not_logged_in_user":"用戶頁面包含目前活動及喜好的總結","current_user":"到你的用戶頁面","topics":{"bulk":{"reset_read":"重設閱讀","delete":"刪除討論話題","dismiss_new":"設定新文章為已讀","toggle":"批量切換選擇討論話題","actions":"批量操作","change_category":"改變分類","close_topics":"關閉討論話題","archive_topics":"已封存的討論話題","notification_level":"改變通知等級","choose_new_category":"為主題選擇新類別：","selected":{"other":"你已選擇了 \u003cb\u003e{{count}}\u003c/b\u003e 個討論話題。"}},"none":{"unread":"沒有未讀的討論話題。","new":"沒有新的討論話題。","read":"你尚未閱讀任何討論話題。","posted":"你尚未在任何討論話題裡發表文章。","latest":"沒有最近的討論話題。真令人難過。","hot":"沒有熱門的討論話題。","bookmarks":"您目前沒有加入書籤的討論話題。","category":"沒有 {{category}} 的討論話題。","top":"沒有精選討論話題。","educate":{"new":"\u003cp\u003e你的新討論話題會出現在這裡。\u003c/p\u003e\u003cp\u003e預設上，2 天內新增的討論話題會被當成新的，並會出現 \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003e新\u003c/span\u003e 此一標籤。\u003c/p\u003e\u003cp\u003e你可以在\u003ca href=\"%{userPrefsUrl}\"\u003e偏好設定\u003c/a\u003e中修改設定。\u003c/p\u003e","unread":"\u003cp\u003e你的未讀討論話題會出現在這裡。\u003c/p\u003e\u003cp\u003e預設上，以下話題會被標示成未讀話題，並且未讀文章數量 \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e 會顯示：\u003c/p\u003e\u003cul\u003e\u003cli\u003e建立新的討論話題\u003c/li\u003e\u003cli\u003e回覆討論話題\u003c/li\u003e\u003cli\u003e閱讀討論話題超過 4 分鐘\u003c/li\u003e\u003c/ul\u003e\u003cp\u003e或若透過討論話題下面的通知設定追蹤或觀察。\u003c/p\u003e\u003cp\u003e你可以在\u003ca href=\"%{userPrefsUrl}\"\u003e偏好設定\u003c/a\u003e中修改設定。\u003c/p\u003e"}},"bottom":{"latest":"已經沒有其它最近的討論話題了。","hot":"已經沒有其它熱門的討論話題了。","posted":"已經沒有其它討論話題了。","read":"已經沒有其它已讀的討論話題了。","new":"已經沒有其它新討論話題了。","unread":"已經沒有其它未讀的討論話題了。","category":"{{category}} 分類已經沒有其它討論話題了。","top":"沒有更多精選討論話題。","bookmarks":"書籤裡沒有更多的討論話題了。"}},"topic":{"filter_to":"在討論話題裡顯示 {{post_count}} 文章","create":"新討論話題","create_long":"建立新討論話題","private_message":"發送訊息","list":"討論話題","new":"新討論話題","unread":"未讀","new_topics":{"other":"{{count}} 個新討論話題"},"unread_topics":{"other":"{{count}} 個未讀討論話題"},"title":"討論話題","invalid_access":{"title":"私人討論話題","description":"抱歉，你沒有進入此討論話題的權限！","login_required":"你需要登入才能看見這個討論話題。"},"server_error":{"title":"討論話題載入失敗","description":"抱歉，可能因為連線有問題而無法載入此討論話題，請再試一次，如果這個問題持續發生，請讓我們知道。"},"not_found":{"title":"未找到討論話題","description":"抱歉，找不到此討論話題，可能已被板主刪除。"},"total_unread_posts":{"other":"你有 {{count}} 個未讀的文章在這討論話題內"},"unread_posts":{"other":"你有 {{count}} 個未讀的舊文章在討論內"},"new_posts":{"other":"自你上次閱讀後，有 {{count}} 篇新文章在此討論話題內"},"likes":{"other":"此討論話題收到了 {{count}} 個讚"},"back_to_list":"回到討論話題列表","options":"討論話題選項","show_links":"在討論話題裡顯示連結","toggle_information":"切換討論話題詳情","read_more_in_category":"要閱讀更多文章嗎? 瀏覽 {{catLink}} 裡的討論話題或 {{latestLink}}。","read_more":"要閱讀更多文章嗎? 請按 {{catLink}} 或 {{latestLink}}。","browse_all_categories":"瀏覽所有分類","view_latest_topics":"檢視最近的文章","suggest_create_topic":"建立一個新討論話題吧？","jump_reply_up":"jump to earlier reply","jump_reply_down":"jump to later reply","deleted":"此討論話題已被刪除","auto_close_notice":"此討論話題將在 %{timeLeft}自動關閉。","auto_close_notice_based_on_last_post":"主題在最後一則回覆後，將會關閉 %{duration}","auto_close_title":"自動關閉設定","auto_close_save":"儲存","auto_close_remove":"不要自動關閉此討論話題","progress":{"title":"topic progress","go_top":"頂部","go_bottom":"底部","go":"前往","jump_bottom_with_number":"跳至第 %{post_number} 篇文章","total":"所有文章","current":"目前的文章","position":"第 %{current}/%{total} 篇文章"},"notifications":{"reasons":{"3_6":"你將會收到通知，因為你正在關注此分類。","3_5":"你將會收到通知，因為你在觀看此討論話題。","3_2":"你將收到關於此討論話題的通知，因為你正在關注此討論話題。","3_1":"你將收到關於此討論話題的通知，因為你建立了此討論話題。","3":"你將收到關於此討論話題的通知，因為你正在關注此討論話題。","2_8":"你將會收到通知，因為你在追蹤此分類。","2_4":"你將收到關於此討論話題的通知，因為你回覆了此討論話題。","2_2":"你將收到關於此討論話題的通知，因為你正在追蹤此討論話題。","2":"你將收到關於此討論話題的通知，因為你\u003ca href=\"/users/{{username}}/preferences\"\u003e看過此討論話題\u003c/a\u003e。","0_7":"你正忽略此分類中的所有通知。","0_2":"你正忽略此討論話題的所有通知。","0":"你正忽略此討論話題的所有通知。"},"watching_pm":{"title":"關注中"},"watching":{"title":"關注"},"tracking_pm":{"title":"追蹤"},"tracking":{"title":"追蹤"},"regular":{"title":"一般"},"regular_pm":{"title":"一般"},"muted_pm":{"title":"靜音","description":"你將不會再收到關於此訊息的通知。"},"muted":{"title":"靜音"}},"actions":{"recover":"復原已刪除的討論話題","delete":"刪除討論話題","open":"開放討論話題","close":"關閉討論話題","multi_select":"選擇文章","auto_close":"自動關閉","pin":"置頂主題","unpin":"取消置頂主題","unarchive":"復原已封存的討論話題","archive":"封存討論話題","invisible":"不出現在列表上","visible":"出現在列表上","reset_read":"重置讀取資料"},"feature":{"pin":"置頂主題","unpin":"取消置頂主題","pin_globally":"全區置頂討論話題","make_banner":"討論話題橫幅","remove_banner":"移除討論話題橫幅"},"reply":{"title":"回覆","help":"回覆此討論話題"},"clear_pin":{"title":"取消置頂","help":"取消討論話題的置頂狀態。"},"share":{"title":"分享","help":"分享此討論話題的連結"},"flag_topic":{"title":"投訴","help":"投訴此討論話題，或以私訊通知管理員","success_message":"已投訴此討論話題。"},"feature_topic":{"title":"擁有這個話題","unpin":"取消此主題在{{categoryLink}}類別的置頂狀態"},"inviting":"正在邀請...","automatically_add_to_groups_optional":"邀請時同時加入以下群組: (選填, 此為管理員設定)","automatically_add_to_groups_required":"邀請時同時加入以下群組: (\u003cb\u003e必填\u003c/b\u003e, 此為管理員設定)","invite_private":{"title":"邀請訊息交流","email_or_username":"受邀請者的電子郵件地址或用戶名稱","email_or_username_placeholder":"電子郵件地址或用戶名稱","action":"邀請","error":"抱歉，向此用戶發出邀請時發生錯誤。","group_name":"群組名稱"},"invite_reply":{"title":"邀請","username_placeholder":"用戶名稱","action":"送出邀請","to_forum":"我們將向你的朋友發出一封電子郵件，他不必登入，他只要按電子郵件裡的連結就可以加入此論壇。","to_topic_blank":"輸入你想邀請的用戶的用戶名稱或電子郵件地址到該討論主題","email_placeholder":"電子郵件地址","success_username":"我們已經邀請該使用者加入此主題討論"},"login_reply":"登入以發表回應","filters":{"n_posts":{"other":"{{count}} 則文章"},"cancel":"取消過濾"},"split_topic":{"title":"移至新討論話題","action":"移至新討論話題","topic_name":"新討論話題的名稱","error":"將討論話題移至新討論話題時發生錯誤。","instructions":{"other":"你即將建立一個新討論話題，並填入 \u003cb\u003e{{count}}\u003c/b\u003e 篇你已選擇的文章。"}},"merge_topic":{"title":"移至已存在的討論話題","action":"移至已存在的討論話題","error":"將討論話題移至已存在的討論話題時發生錯誤。","instructions":{"other":"請選擇你想將那 \u003cb\u003e{{count}}\u003c/b\u003e 篇文章移至哪一個討論話題。"}},"change_owner":{"title":"更改文章的擁有者","action":"變更擁有者","error":"修改文章擁有者時發生錯誤。","label":"文章的新擁有者","placeholder":"新擁有者的用戶名稱","instructions":{"other":"請選擇一位新用戶作為此 {{count}} 篇由 \u003cb\u003e{{old_user}}\u003c/b\u003e 撰寫之文章的擁有者。"},"instructions_warn":"注意，關於此篇文章的舊通知，並不會移轉到新用戶。\u003cbr\u003e警告：目前所有與文章相關的資料都不會移轉至新用戶，請謹慎使用。"},"change_timestamp":{"title":"變更時間戳記","action":"變更時間戳記","invalid_timestamp":"時間戳記不能為將來的時刻。"},"multi_select":{"select":"選取","selected":"選取了 ({{count}})","select_replies":"選取 + 回覆","delete":"刪除選取的文章","cancel":"取消選取","select_all":"選擇全部","deselect_all":"取消選取","description":{"other":"你已選擇了 \u003cb\u003e{{count}}\u003c/b\u003e 篇文章。"}}},"post":{"quote_reply":"引用回覆","edit":"編輯 {{replyAvatar}} {{username}} 發表的 {{link}}","edit_reason":"原因: ","post_number":"文章 {{number}}","last_edited_on":"文章最近編輯的時間","reply_as_new_topic":"回覆為關連的討論話題","continue_discussion":"繼續 {{postLink}} 的討論:","follow_quote":"跳到引用的文章","show_full":"顯示所有文章","show_hidden":"觀看隱藏內容","deleted_by_author":{"other":"( 文章已被作者撤回，除非被投訴，否則在 %{count} 小時內將自動刪除。)"},"expand_collapse":"展開/收合","gap":{"other":"檢視 {{count}} 則隱藏回應"},"more_links":"{{count}} 更多...","unread":"文章未讀","has_replies":{"other":"{{count}} 個回覆"},"has_likes":{"other":"{{count}} 個讚"},"has_likes_title":{"other":"{{count}} 個使用者對此文章讚好"},"errors":{"create":"抱歉，建立你的文章時發生錯誤，請再試一次。","edit":"抱歉，編輯你的文章時發生錯誤，請再試一次。","upload":"抱歉，上傳你的檔案時發生錯誤，請再試一次。","attachment_too_large":"抱歉，你想上傳的檔案太大 (最大限制為 {{max_size_kb}} kb)。","file_too_large":"抱歉，你想上傳的檔案太大 (最大限制為 {{max_size_kb}} kb)。","too_many_uploads":"抱歉，一次只能上傳一個檔案。","too_many_dragged_and_dropped_files":"抱歉，一次最多只能拖放 10 個檔案","upload_not_authorized":"抱歉，你想上傳的是不允許的檔案 (允許的副檔名: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"抱歉，新用戶不可上傳圖片。","attachment_upload_not_allowed_for_new_user":"抱歉，新用戶不可上傳附件。","attachment_download_requires_login":"抱歉，您必須登入以下載附件。"},"abandon":{"confirm":"你確定要捨棄你的文章嗎?","no_value":"否","yes_value":"是"},"via_email":"本文章透過電子郵件送達","whisper":"這文章是版主私人密談","wiki":{"about":"這篇文章設定為 wiki，一般用戶可以編輯它"},"archetypes":{"save":"儲存選項"},"controls":{"reply":"開始編寫對此文章的回覆","like":"給此文章按讚","has_liked":"你已對此文章按讚","undo_like":"撤回讚","edit":"編輯此文章","edit_anonymous":"抱歉，您必須登入以修改文章。","flag":"投訴此文章或傳送私人通知","delete":"刪除此文章","undelete":"復原此文章","share":"分享此文章的連結","more":"更多","delete_replies":{"confirm":{"other":"你是否要同時刪除 {{count}} 篇針對這則文章的回覆？"},"yes_value":"是，將回覆文章一併刪除","no_value":"否，只刪除此文章"},"admin":"文章管理動作","wiki":"做為共筆","unwiki":"取消共筆","convert_to_moderator":"增加工作人員顏色","revert_to_regular":"移除工作人員顏色","rebake":"重建 HTML","unhide":"取消隱藏"},"actions":{"flag":"投訴","defer_flags":{"other":"暫緩投訴"},"it_too":{"off_topic":"一起投訴","spam":"一起投訴","inappropriate":"一起投訴","custom_flag":"一起投訴","bookmark":"一起加上書籤","like":"一起按讚","vote":"一起投票支持"},"undo":{"off_topic":"撤回投訴","spam":"撤回投訴","inappropriate":"撤回投訴","bookmark":"移除書籤","like":"撤回讚","vote":"撤回投票"},"people":{"off_topic":"{{icons}} 標示為偏離主題","spam":"{{icons}} 標示為垃圾文章","spam_with_url":"{{icons}} 投訴 \u003ca href='{{postUrl}}'\u003e此為 spam\u003c/a\u003e","inappropriate":"{{icons}} 標示為不適內容","notify_moderators":"{{icons}} 已通知板主","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003e已通知板主\u003c/a\u003e","notify_user":"{{icons}} 已送出訊息","notify_user_with_url":"{{icons}} 已送出 \u003ca href='{{postUrl}}'\u003e訊息\u003c/a\u003e","bookmark":"{{icons}} 已加上書籤","like":"{{icons}} 已按讚","vote":"{{icons}} 已投票支持"},"by_you":{"off_topic":"你已投訴此文章偏離討論話題","spam":"你已投訴此文章為垃圾","inappropriate":"你已投訴此文章內容不妥","notify_moderators":"你已通知版主此文章","notify_user":"您已送出訊息給這位用戶","bookmark":"你已將此文章加上書籤","like":"你已在此文章按讚","vote":"你已在此文章投票支持"},"by_you_and_others":{"off_topic":{"other":"你與其他 {{count}} 人已投訴此文章為離題內容"},"spam":{"other":"你與其他 {{count}} 人已投訴此文章為垃圾內容"},"inappropriate":{"other":"你與其他 {{count}} 人已投訴此文章為不當內容"},"notify_moderators":{"other":"你與其他 {{count}} 人已投訴此文章請板主處理"},"notify_user":{"other":"您和其他 {{count}} 人已送出訊息給這位用戶"},"bookmark":{"other":"你與 {{count}} 個人將此文章加上書籤"},"like":{"other":"你與其他 {{count}} 人對此按讚"},"vote":{"other":"你與其他 {{count}} 人已投票給此文章"}},"by_others":{"off_topic":{"other":"{{count}} 人已投訴此文章為離題內容"},"spam":{"other":"{{count}} 人已投訴此文章為垃圾內容"},"inappropriate":{"other":"{{count}} 人已投訴此文章為不當內容"},"notify_moderators":{"other":"{{count}} 人已投訴此文章請板主處理"},"notify_user":{"other":"{{count}} 已送出訊息給這位用戶"},"bookmark":{"other":"{{count}} 個人將此文章加上書籤"},"like":{"other":"{{count}} 人對此按讚"},"vote":{"other":"{{count}} 人已投票給此文章"}}},"delete":{"confirm":{"other":"你確定要刪除這些文章?"}},"revisions":{"controls":{"first":"第一版","previous":"上一版","next":"下一版","last":"最新版","hide":"隱藏修訂紀錄","show":"顯示修訂紀錄","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"以單一網頁模式檢視，並標示增加與刪減的內容","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"以並排網頁模式檢視，分開標示增加與刪減的內容","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"顯示原始碼左右比對","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e 原碼"}}}},"category":{"can":"可以\u0026hellip; ","none":"( 無分類 )","all":"所有分類","choose":"選擇一個分類\u0026hellip;","edit":"編輯","edit_long":"編輯","view":"檢視分類裡的討論話題","general":"一般","settings":"設定","topic_template":"主題模板","delete":"刪除分類","create":"新分類","save":"儲存分類","slug":"分類目錄","slug_placeholder":"(選填) 在 url 加上虛線","creation_error":"建立分類時發生錯誤。","save_error":"儲存分類時發生錯誤。","name":"分類名稱","description":"描述","topic":"分類討論話題","logo":"分類圖示","background_image":"分類背景圖片","badge_colors":"識別顏色","background_color":"背景色","foreground_color":"前景色","name_placeholder":"請簡單明瞭。","color_placeholder":"任何網頁顏色","delete_confirm":"你確定要刪除此分類嗎?","delete_error":"刪除此分類時發生錯誤。","list":"列出分類","no_description":"請為此分類新增描述。","change_in_category_topic":"編輯描述","already_used":"此顏色已經用於其它分類","security":"安全性","images":"圖片","auto_close_label":"自動關閉討論話題的期限:","auto_close_units":"小時","email_in":"自訂外來電郵地址:","email_in_allow_strangers":"接受非用戶的電郵","email_in_disabled":"\"用電子郵件張貼新的討論話題\"功能已被關閉。若要使用此功能，","email_in_disabled_click":"請啟用\"email in\"功能","suppress_from_homepage":"不在首頁上顯示此分類。","allow_badges_label":"允許授予本分類的徽章","edit_permissions":"編輯權限","add_permission":"新增權限","this_year":"今年","position":"位置","default_position":"預設的位置","position_disabled":"分類的顯示將會以活躍度為排序依據。若要控制分類排序方法，","position_disabled_click":"請啟用\"固定分類位置\"設定","parent":"父分類","notifications":{"watching":{"title":"關注"},"tracking":{"title":"追蹤"},"muted":{"title":"靜音"}}},"flagging":{"title":"感謝幫助社群遠離邪惡！","private_reminder":"標記是不公開的，\u003cb\u003e只有\u003c/b\u003e 工作人員才可看到","action":"投訴文章","take_action":"執行動作","notify_action":"訊息","delete_spammer":"刪除垃圾文章發送者","delete_confirm":"您將刪除此用戶的 \u003cb\u003e%{posts}\u003c/b\u003e 則文章與 \u003cb\u003e%{topics}\u003c/b\u003e 個討論話題、移除他的帳號、封鎖從他使用的 IP \u003cb\u003e%{ip_address}\u003c/b\u003e 登入、將他的電子郵件地址 \u003cb\u003e%{email}\u003c/b\u003e 加入永久封鎖名稱，你確定此人真的發送垃圾文章嗎?","yes_delete_spammer":"是的，刪除垃圾文章發送者","ip_address_missing":"(N/A)","hidden_email_address":"( 隱藏) ","submit_tooltip":"送出私人投訴","take_action_tooltip":"使其立刻達到投訴門檻，不用等待更多社群投訴","cant":"抱歉，你目前無法投訴此文章。","formatted_name":{"off_topic":"離題內容","inappropriate":"不當內容","spam":"垃圾內容"},"custom_placeholder_notify_user":"請具體說明出有建設性且溫和的意見。","custom_placeholder_notify_moderators":"讓我們知道您的意見，並請盡可能地提供相關連結和例子。","custom_message":{"at_least":"請至少輸入 {{n}} 個字","more":"還需要 {{n}} 個字...","left":"還剩下 {{n}} 個字"}},"flagging_topic":{"title":"感謝幫助社群遠離邪惡！","action":"投訴討論話題","notify_action":"訊息"},"topic_map":{"title":"討論話題摘要","participants_title":"頻繁發文者","links_title":"熱門連結","links_shown":"顯示所有 {{totalLinks}} 個連結...","clicks":{"other":"%{count} 點擊"}},"topic_statuses":{"warning":{"help":"這是正式警告。"},"bookmarked":{"help":"已將此討論話題加入書籤"},"locked":{"help":"此討論話題已關閉，不再接受回覆"},"archived":{"help":"此討論話題已封存，已被凍結無法再修改"},"unpinned":{"title":"取消釘選","help":"此討論話題已取消置頂，將會以預設順序顯示。"},"pinned_globally":{"title":"全區置頂"},"pinned":{"title":"已釘選","help":"此討論話題已置頂，將顯示在它所屬分類話題列表的最上方"},"invisible":{"help":"此討論話題已隱藏，將不會出現在討論話題列表，只能以直接連結開啟。"}},"posts":"文章","posts_lowercase":"文章","posts_long":"此討論話題有 {{number}} 篇文章","original_post":"原始文章","views":"觀看","views_lowercase":{"other":"觀看"},"replies":"回覆","views_long":"此討論話題已被看過 {{number}} 次","activity":"活動","likes":"讚","likes_lowercase":{"other":"個讚"},"likes_long":"此討論話題收到了  {{number}}  個讚","users":"用戶","users_lowercase":{"other":"用戶"},"category_title":"分類","history":"歷史","changed_by":"作者 {{author}}","raw_email":{"title":"原始 Email","not_available":"不可使用"},"categories_list":"分類清單","filters":{"with_topics":"%{filter} 討論話題","with_category":"%{filter} %{category} 討論話題","latest":{"help":"最近的討論話題"},"hot":{"title":"熱門","help":"最熱門的討論話題"},"read":{"title":"已讀","help":"你看過的討論話題，以閱讀的先後順序排列"},"search":{"title":"搜尋","help":"搜尋所有討論話題"},"categories":{"title":"分類","title_in":"分類 - {{categoryName}}","help":"所有討論話題以分類區分"},"unread":{"help":"你所關注或追蹤的討論話題有未讀文章"},"new":{"lower_title":"新話題","help":"最近幾天建立的主題"},"posted":{"title":"我的文章","help":"你回覆過的討論話題"},"bookmarks":{"title":"書籤","help":"你加進書籤的討論話題"},"category":{"help":"{{categoryName}} 分類最近的討論話題"},"top":{"title":"精選","help":"在本年、月、週或日最熱門的討論話題","all":{"title":"所有時間"},"yearly":{"title":"年"},"quarterly":{"title":"季度"},"monthly":{"title":"月"},"weekly":{"title":"周"},"daily":{"title":"日"},"all_time":"所以時間","this_year":"年","this_quarter":"季度","this_month":"月","this_week":"週","today":"今天","other_periods":"前往頂端"}},"browser_update":"抱歉，\u003ca href=\"http://www.discourse.org/faq/#browser\"\u003e您的瀏覽器版本太舊，無法正常訪問該站點。\u003c/a\u003e。請\u003ca href=\"http://browsehappy.com\"\u003e升級您的瀏覽器\u003c/a\u003e。","permission_types":{"full":"建立 / 回覆 / 觀看","create_post":"回覆 / 觀看","readonly":"觀看"},"type_to_filter":"輸入要搜尋的文字...","admin":{"title":"論壇管理員","moderator":"板主","dashboard":{"title":"控制台","last_updated":"控制台最後更新時間:","version":"版本","up_to_date":"你使用的是最新版本!","critical_available":"有重要更新可以安裝。","updates_available":"有更新可以安裝。","please_upgrade":"請升級！","no_check_performed":"從未檢查是否有更新可以使用，請確定 sidekiq 有在執行中。","stale_data":"最近未檢查是否有更新可以使用，請確定 sidekiq 有在執行中。","version_check_pending":"看來你最近升級了，非常好！","installed_version":"已安裝","latest_version":"最新版本","problems_found":"我們在你目前安裝的 Discourse 版本發現這些問題:","last_checked":"上次檢查的時間","refresh_problems":"重新整理","no_problems":"未發現任何問題。","moderators":"板主：","admins":"管理員：","blocked":"已封鎖：","suspended":"已停權:","private_messages_short":"訊息","private_messages_title":"訊息","space_free":"{{size}} 可用空間","uploads":"上傳","backups":"備份檔","traffic_short":"流量","traffic":"網頁應用程式請求數","page_views":"API Requests","page_views_short":"API Requests","show_traffic_report":"顯示詳細的流量報表","reports":{"today":"今天","yesterday":"昨天","last_7_days":"最近 7 天","last_30_days":"最近 30 天","all_time":"所有時間","7_days_ago":"7 天前","30_days_ago":"30 天前","all":"全部","view_table":"表格","view_chart":"柱狀圖","refresh_report":"重新整理報告","start_date":"開始日期","end_date":"結束日期"}},"commits":{"latest_changes":"最近的變更：請經常更新！","by":"由"},"flags":{"title":"投訴","old":"舊的","active":"待處理","agree":"同意","agree_title":"確認此投訴為有效且正確","agree_flag_modal_title":"批准並且 ...","agree_flag_hide_post":"批准 (隱藏文章 + 送出私人訊息)","agree_flag_hide_post_title":"隱藏此文章，並自動向此用戶送出私人訊息，要求盡快修改它","agree_flag_restore_post":"同意（還原文章）","agree_flag_restore_post_title":"回復此文章","agree_flag":"同意投訴","agree_flag_title":"同意投訴且不更動文章","defer_flag":"延遲","defer_flag_title":"移除標記；不需處理。","delete":"刪除","delete_title":"刪除此標記文章。","delete_post_defer_flag":"刪除文章並且延緩檢舉","delete_post_defer_flag_title":"刪除文章，如果刪除的是討論話題的第一則文章，討論話題也將一併刪除","delete_post_agree_flag":"刪除文章並且同意檢舉","delete_post_agree_flag_title":"刪除文章，如果刪除的是討論話題的第一則文章，討論話題也將一併刪除","delete_flag_modal_title":"刪除並且...","delete_spammer":"刪除垃圾文章發送者","delete_spammer_title":"刪除此用戶與他的所有文章與討論話題","disagree_flag_unhide_post":"不同意 ( 取消文章的隱藏狀態 )","disagree_flag_unhide_post_title":"移除此帖的任何檢舉，並使其重新可見","disagree_flag":"不同意","disagree_flag_title":"否決此投訴為無效或有誤","clear_topic_flags":"完成","clear_topic_flags_title":"該討論話題已被調查，問題已經解決。點擊完成以移除投訴。","more":"（更多回覆）","dispositions":{"agreed":"同意","disagreed":"不同意","deferred":"之後再處理"},"flagged_by":"投訴者","resolved_by":"處理為","took_action":"採取行動","system":"系統","error":"發生了某些錯誤","reply_message":"回覆","no_results":"沒有投訴。","topic_flagged":"此 \u003cstrong\u003e討論話題\u003c/strong\u003e 已被投訴。","visit_topic":"瀏覽討論話題以採取行動","was_edited":"文章已在第一次標記後被編輯","previous_flags_count":"這篇文章已經被標記  {{count}} 次。","summary":{"action_type_3":{"other":"離題 x{{count}}"},"action_type_4":{"other":"不宜內容 x{{count}}"},"action_type_6":{"other":"自訂 x{{count}}"},"action_type_7":{"other":"自訂 x{{count}}"},"action_type_8":{"other":"垃圾內容 x{{count}}"}}},"groups":{"primary":"主要群組","no_primary":"( 沒有主要群組 )","title":"群組","edit":"編輯群組","refresh":"重新整理","new":"建立","selector_placeholder":"輸入用戶名稱","name_placeholder":"群組名稱，不可含有空白字元，使用戶名稱的規則相同","about":"請在此編輯你的群組成員與名稱","group_members":"群組成員","delete":"刪除","delete_confirm":"刪除此群組？","delete_failed":"無法刪除群組，自動建立的群組無法刪除。","delete_member_confirm":"從 '%{group}' 群組刪除 '%{username}' ?","name":"名稱","add":"加入","add_members":"新增成員","custom":"客製","automatic":"自動建立","automatic_membership_email_domains":"註冊的用戶的電子郵件地址網域，完全符合列表裡某項時，會自動加進這個群組裡：","automatic_membership_retroactive":"套用相同的電子郵件網域規則到已經註冊的用戶上：","default_title":"群組內所有成員的預設頭銜","primary_group":"自動設定為主要群組"},"api":{"generate_master":"產生主 API 金鑰","none":"目前沒有啟用中的 API 金鑰。","user":"用戶","title":"API","key":"API 金鑰","generate":"產生","regenerate":"重新產生","revoke":"撤銷","confirm_regen":"你確定要以新的 API 金鑰取代取的嗎?","confirm_revoke":"你確定要撤銷此金鑰嗎?","info_html":"你可以使用 API 金鑰呼叫 JSON 建立與更新討論話題。","all_users":"所有用戶","note_html":"請\u003cstrong\u003e安全地\u003c/strong\u003e保管密鑰，任何擁有該密鑰的使用者，都可以使用它以任何的使用者的名義發文。"},"plugins":{"title":"外掛","installed":"已安裝外掛","name":"名稱","none_installed":"尚未安裝任何外掛","version":"版本","enabled":"啟用?","is_enabled":"是","not_enabled":"否","change_settings":"更改設定","change_settings_short":"設定","howto":"如何安裝外掛?"},"backups":{"title":"備份","menu":{"backups":"備份","logs":"紀錄"},"none":"沒有可用的備份。","read_only":{"enable":{"title":"啟動唯讀模式","label":"啟動唯讀模式","confirm":"你確定要啟動唯讀模式?"},"disable":{"title":"關閉啟動唯讀模式","label":"關閉唯讀模式"}},"logs":{"none":"尚無紀錄..."},"columns":{"filename":"文件名稱","size":"大小"},"upload":{"label":"上傳","title":"上傳備份","uploading":"上傳中...","success":"'{{filename}}' 已成功被上載","error":"上載時發生問題： '{{filename}}': {{message}}"},"operations":{"is_running":"指令執行中...","failed":"{{operation}} 執行失敗。請觀看紀錄。","cancel":{"label":"取消","title":"取消現行指令","confirm":"你確定要消取現行指令嗎?"},"backup":{"label":"備份","title":"新增備份","confirm":"你確定要新增備份嗎?","without_uploads":"是 ( 不包含檔案 )"},"download":{"label":"下載","title":"下載備份"},"destroy":{"title":"刪除備份","confirm":"你確定要刪除備份嗎?"},"restore":{"is_disabled":"此站設定已關閉復原","label":"還原","title":"復原備份","confirm":"你確定要復原備份嗎?"},"rollback":{"label":"回溯","title":"回溯資料庫到以前的工作階段","confirm":"你確定要回溯資料庫到以前的工作階段?"}}},"export_csv":{"user_archive_confirm":"你確定要下載你的文章嗎?","success":"開始匯出，處理完畢後將以私人訊息通知你。","failed":"匯出失敗。請觀看紀錄。","rate_limit_error":"文章每天只能下載一次，請明天再試。","button_text":"匯出","button_title":{"user":"以 CSV 格式匯出用戶清單","staff_action":"以 CSV 格式匯出所有工作人員操作紀錄","screened_email":"以 CSV 格式匯出所有已顯示的電子郵件列表","screened_ip":"以 CSV 格式匯出所有已顯示的 IP 列表","screened_url":"以 CSV 格式匯出所有已顯示的 URL 列表"}},"export_json":{"button_text":"匯出"},"invite":{"button_text":"送出邀請","button_title":"送出邀請"},"customize":{"title":"客製化","long_title":"網站客製化","css":"CSS","header":"標頭","top":"精選","footer":"頁尾","embedded_css":"內嵌 CSS","head_tag":{"text":"\u003c/head\u003e","title":"HTML 將會置於 \u003c/head\u003e 之前"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML 將會置於 \u003c/body\u003e 之前"},"override_default":"不要保含標準樣式","enabled":"已啟用?","preview":"預覽","undo_preview":"移除預覽","rescue_preview":"預設風格","explain_preview":"以此自訂樣式預覽網頁","explain_undo_preview":"還原現時的自訂樣式","explain_rescue_preview":"以預設樣式預覽網頁","save":"儲存","new":"新增","new_style":"新增樣式","import":"匯入","import_title":"選取檔案或貼上文本","delete":"刪除","delete_confirm":"刪除此樣式？","about":"修改網站的 CSS 和 HTML headers。請新增一個自定樣式來開始使用。","color":"顏色","opacity":"不透明度","copy":"複製","css_html":{"title":"CSS/HTML","long_title":"CSS 與 HTML 客製化"},"colors":{"title":"顏色","long_title":"顏色樣式","about":"不需撰寫 CSS 即可修改網站的顏色。請新增一項方案來開始使用。","new_name":"新的配色樣式","copy_name_prefix":"複製於","delete_confirm":"刪除此顏色樣式？","undo":"復原","undo_title":"復原你前次對此顏色所做的修改","revert":"回復","revert_title":"重設此顏色為 Discourse 的預設顏色樣式","primary":{"name":"一級","description":"大部分的文字、圖示和邊框"},"secondary":{"name":"二級","description":"主要的背景顏色和一些按鈕上的文字顏色"},"tertiary":{"name":"三級","description":"連結、一些按鈕、通知和強調顏色"},"quaternary":{"name":"四級","description":"導覽連結"},"header_background":{"name":"標頭背景","description":"網站標頭的背景顏色"},"header_primary":{"name":"標頭主要區域","description":"網站標頭的文字和圖示"},"highlight":{"name":"重點","description":"頁面上重點元素的背景顏色，例如文章和討論話題"},"danger":{"name":"危險","description":"重要動作例如刪除文章和討論話題的重點顏色"},"success":{"name":"成功","description":"用來表示一項動作已順利完成"},"love":{"name":"愛","description":"按讚按鈕的顏色"},"wiki":{"name":"共筆","description":"共筆文章的背景顏色"}}},"email":{"title":"電郵","settings":"設定","all":"所有","sending_test":"傳送測試郵件","error":"\u003cb\u003e錯誤\u003c/b\u003e - %{server_error}","test_error":"發送測試電子郵件時遇到錯誤。請檢查你輸入的電子郵件地址，並確認網路提供者沒有封鎖郵件的發送，然後再試一次。","sent":"送出","skipped":"跳過","sent_at":"送出時間","time":"時間","user":"用戶","email_type":"電子郵件類型","to_address":"目的地址","test_email_address":"要測試的電子郵件地址","send_test":"送出測試Email","sent_test":"已送出!","delivery_method":"傳送方式","preview_digest":"預覽文摘","refresh":"重新整理","format":"格式","html":"html","text":"純文字","last_seen_user":"最近出現的用戶:","reply_key":"回覆金鑰","skipped_reason":"跳過原因","logs":{"none":"找不到記錄。","filters":{"title":"過濾","user_placeholder":"username","address_placeholder":"name@example.com","type_placeholder":"digest, signup...","reply_key_placeholder":"回覆金鑰","skipped_reason_placeholder":"原因"}}},"logs":{"title":"記錄","action":"動作","created_at":"已建立","last_match_at":"最近出現時間","match_count":"出現次數","ip_address":"IP","topic_id":"討論話題 ID","post_id":"文章 ID","delete":"刪除","edit":"編輯","save":"儲存","screened_actions":{"block":"封鎖","do_nothing":"無動作"},"staff_actions":{"title":"工作人員動作","instructions":"點擊使用者名稱會過濾列表，點擊使用者圖片則會連結至使用者頁面。","clear_filters":"全部顯示","staff_user":"工作人員用戶","target_user":"目標用戶","subject":"主旨","when":"時間","context":"關聯","details":"詳情","previous_value":"舊","new_value":"新","diff":"比較","show":"顯示","modal_title":"詳情","no_previous":"無舊設定值。","deleted":"無新設定值，記錄已刪除。","actions":{"delete_user":"刪除用戶","change_trust_level":"修改信任等級","change_username":"修改用戶名稱","change_site_setting":"修改網站設定","change_site_customization":"修改網站客製化","delete_site_customization":"刪除網站客製化","suspend_user":"將用戶停權","unsuspend_user":"恢復用戶權限","grant_badge":"升級徽章","revoke_badge":"撤回徽章","check_email":"檢查電子郵件","delete_topic":"刪除討論話題","delete_post":"刪除文章","impersonate":"檢視","anonymize_user":"匿名用戶"}},"screened_emails":{"title":"過濾的電子郵件地址","description":"以下的電子郵件地址將無法用來建立新用戶。","email":"電子郵件地址","actions":{"allow":"允許"}},"screened_urls":{"title":"過濾的網址","description":"以下是出現在垃圾文章裡的網址。","url":"網址","domain":"網域"},"screened_ips":{"title":"過濾的 IP 位址","description":"受監控的 IP 位址，使用 \"允許\" 將 IP 位址加入白名單。","delete_confirm":"你確定要刪除 %{ip_address} 的規則嗎?","roll_up_confirm":"您確定要將常用的 IP 地址歸類為子網域位址嗎？","rolled_up_some_subnets":"成功地 roll up 了 IP 封鎖記錄至這些子網域： %{subnets}。","rolled_up_no_subnet":"無法 roll up","actions":{"block":"封鎖","do_nothing":"允許","allow_admin":"允許管理"},"form":{"label":"新增:","ip_address":"IP 位址","add":"加入","filter":"搜尋"},"roll_up":{"text":"Roll up","title":"如果有至少 'min_ban_entries_for_roll_up' 個記錄，建立一個子網域封鎖記錄"}},"logster":{"title":"錯誤紀錄"}},"impersonate":{"title":"檢視角度","help":"使用此工具以用戶的檢視角度進行除錯。完成後將需登出。","not_found":"找不到那位使用者。"},"users":{"title":"用戶","create":"新增管理員","last_emailed":"最近寄出電子郵件","not_found":"抱歉，系統裡無此用戶名稱。","id_not_found":"抱歉，系統裡無此用戶名稱。","active":"啟用的","show_emails":"顯示電子郵件","nav":{"new":"新用戶","active":"啟用的","pending":"申請中","staff":"管理員","suspended":"已停權","blocked":"已封鎖","suspect":"嫌疑"},"approved":"已批准？","approved_selected":{"other":"批准用戶 ({{count}})"},"reject_selected":{"other":"拒絕用戶 ({{count}})"},"titles":{"active":"活躍的用戶","new":"新用戶","pending":"等待審核的用戶","newuser":"信任等級 0 的用戶 ( 新用戶 )","basic":"信任等級 1 的用戶 ( 初級用戶 )","staff":"管理員","admins":"管理員","moderators":"板主","blocked":"已封鎖的用戶","suspended":"已停權的用戶","suspect":"嫌疑使用者"},"reject_successful":{"other":"成功拒絕 %{count} 個用戶。"},"reject_failures":{"other":"無法拒絕 %{count} 個用戶"},"not_verified":"未確認","check_email":{"title":"顯示使用者 Email","text":"顯示"}},"user":{"suspend_failed":"將此用戶停權時發生錯誤 {{error}}","unsuspend_failed":"恢復此用戶的權限時發生錯誤 {{error}}","suspend_duration":"你想將此用戶停權多久?","suspend_duration_units":"(天)","suspend_reason_label":"你為什麼要將此用戶停權？你輸入的原因將在此用戶登入時顯示，及顯示在此用戶的基本資料頁面，且\u003cb\u003e任何人都可以看見\u003c/b\u003e，請簡短說明原因。","suspend_reason":"原因","suspended_by":"將其停權者","delete_all_posts":"刪除所有文章","delete_all_posts_confirm":"你確定要刪除 %{posts} 篇文章與 %{topics} 個討論話題嗎?","suspend":"停權","unsuspend":"恢復權限","suspended":"已停權?","moderator":"板主？","admin":"管理員？","blocked":"已封鎖？","show_admin_profile":"管理員","edit_title":"編輯標題","save_title":"儲存標題","refresh_browsers":"強制瀏覽器重新整理","refresh_browsers_message":"訊息已寄出給所有用戶!","show_public_profile":"顯示公開的基本資料","impersonate":"檢視角度","ip_lookup":"IP 反查","log_out":"登出","logged_out":"用戶已從所有裝置中登出","revoke_admin":"撤銷管理員權限","grant_admin":"授予管理員權限","revoke_moderation":"撤銷板主權限","grant_moderation":"授予板主權限","unblock":"解除封鎖","block":"封鎖","reputation":"聲望","permissions":"權限","activity":"活動","like_count":"已給出 / 收到的讚","last_100_days":"在過去 100 天內","private_topics_count":"私人討論話題","posts_read_count":"讀過的文章","post_count":"已發表的文章","topics_entered":"讀過的討論話題","flags_given_count":"投訴","flags_received_count":"被投訴","warnings_received_count":"收到的警告","flags_given_received_count":"已提出 / 收到的投訴","approve":"批准","approved_by":"批准者","approve_success":"用戶已獲得批准並送出啟用帳號的電子郵件。","approve_bulk_success":"完成! 已批准所有選取的用戶並送出通知。","time_read":"閱讀時間","anonymize":"匿名用戶","anonymize_confirm":"你確定要將這個帳戶變成匿名？這將改變用戶名和電子郵件，並重置所有個人資料信息。","anonymize_yes":"是，將這個帳戶變成匿名","anonymize_failed":"將這個帳戶變成匿名時發生錯誤。","delete":"刪除用戶","delete_forbidden_because_staff":"管理員與板主不可刪除。","delete_posts_forbidden_because_staff":"無法刪除管理員和版主的所有帖子。","delete_forbidden":{"other":"不能刪除擁有文章的用戶。請先刪除所有文章後才能刪除該用戶。( 發表超過 %{count} 天的文章不能刪除 )"},"cant_delete_all_posts":{"other":"無法刪除所有的文章。有些文章時間早於 %{count} 天前。 ( 請見 delete_user_max_post_age 設定 )"},"cant_delete_all_too_many_posts":{"other":"無法刪除所有文章，因為此用戶擁有超過 %{count} 篇文章。( delete_all_posts_max )"},"delete_confirm":"你確定要刪除此用戶嗎? 此動作將不可復原!","delete_and_block":"刪除並且\u003cb\u003e封鎖\u003c/b\u003e此電子郵件地址與 IP 位址","delete_dont_block":"只刪除","deleted":"此用戶已刪除。","delete_failed":"刪除此用戶時發生錯誤，請先刪除此用戶的所有文章後再試一次。","send_activation_email":"送出啟用帳號的電子郵件","activation_email_sent":"啟用帳號的電子郵件已送出。","send_activation_email_failed":"送出啟用帳號的電子郵件時發生錯誤。%{error}","activate":"啟用帳號","activate_failed":"啟用此帳號時發生錯誤。","deactivate_account":"取消帳號的啟用狀態","deactivate_failed":"取消此帳號的啟用狀態時發生錯誤。","unblock_failed":"解除此用戶的封鎖狀態時發生錯誤。","block_failed":"封鎖此用戶時發生錯誤。","deactivate_explanation":"帳號的啟用狀態被取消的用戶必需重新啟用帳號。","suspended_explanation":"被停權的用戶無法登入。","block_explanation":"被封鎖的用戶無法發表文章或建立討論話題。","trust_level_change_failed":"修改用戶的信任等級時發生錯誤。","suspend_modal_title":"將用戶停權","trust_level_2_users":"信任等級 2 用戶","trust_level_3_requirements":"信任等級 3 之條件","trust_level_locked_tip":"信任等級鎖定，系統將不會升級或降級使用者。","trust_level_unlocked_tip":"信任等級解除鎖定，系統將會升級或降級使用者。","lock_trust_level":"鎖住信任等級","unlock_trust_level":"解鎖信任等級","tl3_requirements":{"title":"信任等級 3 之條件","table_title":"在過去100天內：","value_heading":"價值","requirement_heading":"要求","visits":"訪問","days":"天","topics_replied_to":"討論話題回覆","topics_viewed":"已讀討論話題","topics_viewed_all_time":"已瀏覽的討論話題 (任何時間)","posts_read":"已讀文章","posts_read_all_time":"已讀的文章 (任何時間)","flagged_posts":"被投訴的文章","flagged_by_users":"投訴之用戶","likes_given":"給出的讚","likes_received":"收到的讚","likes_received_days":"收到的讚：唯一日","likes_received_users":"收到的讚：唯一使用者","qualifies":"符合信任等級 3 的條件。","does_not_qualify":"不符合信任等級 3 的條件。","will_be_promoted":"將會在近期升級。","will_be_demoted":"將會在近期降級。","on_grace_period":"目前在升級優惠階段，將不會被降級。","locked_will_not_be_promoted":"信任等級鎖定。將不會再被升級。","locked_will_not_be_demoted":"信任等級鎖定。將不會再被降級。"},"sso":{"title":"單一登入","external_id":"外部 ID","external_username":"用戶名稱","external_name":"名稱","external_email":"電子郵件","external_avatar_url":"個人資料圖片 URL"}},"user_fields":{"title":"使用者欄位","help":"增加欄位讓你的使用者可以填寫","create":"建立使用者欄位","untitled":"未命名","name":"欄位名稱","type":"欄位類別","description":"欄位敘述","save":"儲存","edit":"編輯","delete":"刪除","cancel":"取消","delete_confirm":"你確定要刪除此用戶欄位 ?","options":"選項","required":{"title":"在註冊時必填？","enabled":"必填","disabled":"非必填"},"editable":{"title":"在註冊後可以修改？","enabled":"可編輯","disabled":"不可編輯"},"show_on_profile":{"title":"顯示在公開的基本資料裡?","enabled":"在基本資料裡顯示","disabled":"不在基本資料裡顯示"},"field_types":{"text":"文字區域","confirm":"確認","dropdown":"下拉"}},"site_text":{"none":"選擇一個內容類別開始編輯","title":"文字內容"},"site_settings":{"show_overriden":"只顯示修改過的項目","title":"設定","reset":"重設","none":"無","no_results":"未找到任何結果。","clear_filter":"清除","add_url":"加入網址","add_host":"新增主機","categories":{"all_results":"全部","required":"必要設定","basic":"基本設定","users":"用戶","posting":"文章","email":"電子郵件","files":"檔案","trust":"信任等級","security":"安全性","onebox":"單一框","seo":"SEO","spam":"垃圾文章","rate_limits":"評等限制","developer":"開發人員","embedding":"嵌入","legal":"法律","uncategorized":"其他","backups":"備份","login":"登入","plugins":"延伸套件","user_preferences":"偏好設定"}},"badges":{"title":"徽章","new_badge":"新徽章","new":"新","name":"名稱","badge":"徽章","display_name":"顯示名稱","description":"簡述","badge_type":"徽章類型","badge_grouping":"群組","badge_groupings":{"modal_title":"徽章群組"},"granted_by":"升級者為","granted_at":"升級在","reason_help":"(連結至文章或主題)","save":"儲存","delete":"刪除","delete_confirm":"你確定要刪除徽章 ?","revoke":"撤回","reason":"原因","expand":"展開 \u0026hellip; ","revoke_confirm":"你確定要撤回這個徽章?","edit_badges":"編輯徽章","grant_badge":"升級徽章","granted_badges":"已升級的徽章","grant":"升級","no_user_badges":"%{name} 未有任何升級徽章。","no_badges":"沒有可授予的徽章","none_selected":"選擇一個徽章開始","allow_title":"允許使用徽章作為稱號","multiple_grant":"可多次授予","listable":"在徽章頁面上顯示徽章","enabled":"啟用徽章","icon":"圖示","image":"圖片","icon_help":"使用 Font Awesome class 或者圖片的聯結","query":"徽章查詢語法 (SQL)","target_posts":"查詢文章張貼目標","auto_revoke":"每日執行撤銷用的 SQL 語法","show_posts":"在徽章頁面顯示獲得徽章的文章","trigger":"觸發","trigger_type":{"none":"每日更新","post_action":"當用戶對文章有動作","post_revision":"當用戶新增或是編輯一個文章","trust_level_change":"當用戶信任等級有改變","user_change":"當用戶被新增或是編輯"},"preview":{"link_text":"預覽獲得的徽章","plan_text":"預覽 SQL 查詢語法","modal_title":"徽章 SQL 語法預覽","sql_error_header":"SQL 查詢發生了錯誤。","error_help":"徽章的 SQL 查詢語法請參考以下連結。","bad_count_warning":{"header":"警告 !","text":"查詢結果沒有授予徽章的樣本；當查詢結果回傳的使用者 ID 或文章 ID 不存在時此問題有可能發生。如此可能會發生未預期的結果 ―― 請再次檢查您的 SQL 語法。"},"sample":"樣本：","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e 的文章 %{link} ","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e 的文章 %{link} 在 \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e 在 \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"新增新的emoji供所有人使用。(提示：一次拖放多個檔案)","add":"新增emoji","name":"名稱","image":"圖片","delete_confirm":"你確定要刪除 :%{name}: emoji ?"},"embedding":{"confirm_delete":"你確定要刪除此主機？","title":"嵌入","host":"允許的主機","edit":"編輯","add_host":"新增主機","settings":"嵌入設定","crawling_settings":"爬蟲設定"},"permalink":{"title":"固定連結","url":"網址","topic_id":"討論話題 ID","topic_title":"討論話題","post_id":"貼文 ID","post_title":"貼文","category_id":"分類 ID","category_title":"分類","external_url":"外部網址","delete_confirm":"你確定要刪除此固定連結？","form":{"label":"新增：","add":"新增","filter":"搜尋 (網址或外部網址)"}}},"lightbox":{"download":"下載"},"search_help":{"title":"搜尋幫助"},"keyboard_shortcuts_help":{"title":"快捷鍵","jump_to":{"title":"跳到","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e 首頁","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e 最新","new":"\u003cb\u003eg\u003c/b\u003e , \u003cb\u003en\u003c/b\u003e 新","unread":"\u003cb\u003eg\u003c/b\u003e , \u003cb\u003eu\u003c/b\u003e 未讀","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e 分類","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e 頂端","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e 書籤","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e 私人訊息"},"navigation":{"title":"導航","jump":"\u003cb\u003e#\u003c/b\u003e 前往文章 #","back":"\u003cb\u003eu\u003c/b\u003e 返回","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e 移動選區 \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e 或 \u003cb\u003eEnter\u003c/b\u003e 開啟已選擇討論話題","next_prev":"\u003cb\u003eshift j\u003c/b\u003e/\u003cb\u003eshift k\u003c/b\u003e 下一個/上一個段落"},"application":{"title":"Application","create":"\u003cb\u003ec\u003c/b\u003e 表示新討論話題","notifications":"\u003cb\u003en\u003c/b\u003e 開啟通知","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e 打開漢堡選單","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e 打開使用者選單","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e 顯示有更新的討論話題","search":"\u003cb\u003e/\u003c/b\u003e 搜尋","help":"\u003cb\u003e?\u003c/b\u003e 打開按鍵說明","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e 解除新文章或回覆的提示","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e 解除主題的提示","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e 登出"},"actions":{"title":"行動","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e 加入/移除書籤","pin_unpin_topic":"\u003cb\u003eshift p\u003c/b\u003e 置頂/取消置頂","share_topic":"\u003cb\u003eshift s\u003c/b\u003e 分享討論話題","share_post":"\u003cb\u003es\u003c/b\u003e 分享文章","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e 回覆為關聯主題","reply_topic":"\u003cb\u003eshift r\u003c/b\u003e 回覆討論話題","reply_post":"\u003cb\u003er\u003c/b\u003e 回覆文章","quote_post":"\u003cb\u003eq\u003c/b\u003e 引用文章","like":"\u003cb\u003el\u003c/b\u003e 按讚","flag":"\u003cb\u003e!\u003c/b\u003e 投訴文章","bookmark":"\u003cb\u003eb\u003c/b\u003e 將文章加上書籤","edit":"\u003cb\u003ee\u003c/b\u003e 編輯文章","delete":"\u003cb\u003ed\u003c/b\u003e 刪除文章","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e 消音討論話題","mark_regular":"\u003cb\u003em\u003c/b\u003e , \u003cb\u003er\u003c/b\u003e 正常(預設)討論話題","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e 追蹤討論話題","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e 關注討論話題"}},"badges":{"title":"徽章","allow_title":"允許使用它作為稱號","multiple_grant":"可以多次授予","badge_count":{"other":"%{count} 徽章"},"more_badges":{"other":"+%{count} 以上"},"granted":{"other":"%{count} 升級"},"select_badge_for_title":"選擇一枚徽章作為你的稱號","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"開始入門"},"community":{"name":"社群"},"trust_level":{"name":"信任等級"},"other":{"name":"其他"},"posting":{"name":"文章"}},"badge":{"editor":{"name":"編輯","description":"首篇文章編輯"},"basic_user":{"name":"初級","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003e取得\u003c/a\u003e所有基本社群功能"},"member":{"name":"成員","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003e取得\u003c/a\u003e邀請功能"},"regular":{"name":"常客","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003e取得\u003c/a\u003e重新分類、重新命名、連結跟隨（無 nofollow 屬性）、貴賓室功能"},"leader":{"name":"領袖","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003e取得\u003c/a\u003e全域編輯、置頂、關閉、封存、分割、合併討論話題功能"},"welcome":{"name":"歡迎","description":"收到一個讚"},"autobiographer":{"name":"自我介紹","description":"填寫用戶\u003ca href=\"/my/preferences\"\u003e個人\u003c/a\u003e 資料"},"anniversary":{"name":"周年紀念日","description":"一年中的活躍使用者，至少發表一次"},"nice_post":{"name":"好文章","description":"一篇文章收到 10 個讚。此徽章可多次獲得。"},"good_post":{"name":"棒文章","description":"一篇文章收到 25 個讚。此徽章可多次獲得。"},"great_post":{"name":"神文章","description":"一篇文章收到 50 個讚。此徽章可多次獲得。"},"nice_topic":{"name":"好話題","description":"一篇討論話題獲得 10 個讚。本徽章可以多次取得。"},"good_topic":{"name":"棒話題","description":"一篇討論話題獲得 25 個讚。本徽章可以多次取得。"},"great_topic":{"name":"神話題","description":"一篇討論話題獲得 50 個讚。本徽章可以多次取得。"},"nice_share":{"name":"好分享","description":"分享一篇文章給 25 位不同的訪客"},"good_share":{"name":"棒分享","description":"分享一篇文章給 300 位不同的訪客"},"great_share":{"name":"神分享","description":"分享一篇文章給 1000 位不同的訪客"},"first_like":{"name":"首次讚好","description":"給此貼文按讚"},"first_flag":{"name":"首次標記","description":"標記文章"},"promoter":{"name":"推手","description":"已邀請一位用戶"},"campaigner":{"name":"說客"},"champion":{"name":"鬥士"},"first_share":{"name":"首個分享","description":"分享文章"},"first_link":{"name":"首次連結","description":"其他討論話題含內部連結"},"first_quote":{"name":"首先引用","description":"標記使用者"},"read_guidelines":{"name":"觀看守則","description":"觀看\u003ca href=\"/guidelines\"\u003e社群守則\u003c/a\u003e"},"reader":{"name":"讀者","description":"觀看每個超過100篇文章的討論話題"},"popular_link":{"name":"熱門連結"}}}}},"en":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"units":{"byte":{"one":"Byte"}}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"full_no_year_no_time":"MMMM Do","full_with_year_no_time":"MMMM Do, YYYY","tiny":{"less_than_x_seconds":{"one":"\u003c 1s"},"x_seconds":{"one":"1s"},"less_than_x_minutes":{"one":"\u003c 1m"},"x_minutes":{"one":"1m"},"about_x_hours":{"one":"1h"},"x_days":{"one":"1d"},"about_x_years":{"one":"1y"},"over_x_years":{"one":"\u003e 1y"},"almost_x_years":{"one":"1y"}},"medium":{"x_minutes":{"one":"1 min"},"x_hours":{"one":"1 hour"},"x_days":{"one":"1 day"}},"medium_with_ago":{"x_minutes":{"one":"1 min ago"},"x_hours":{"one":"1 hour ago"},"x_days":{"one":"1 day ago"}},"later":{"x_days":{"one":"1 day later"},"x_months":{"one":"1 month later"},"x_years":{"one":"1 year later"}}},"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","links_lowercase":{"one":"link"},"character_count":{"one":"{{count}} character"},"topic_count_latest":{"one":"{{count}} new or updated topic."},"topic_count_unread":{"one":"{{count}} unread topic."},"topic_count_new":{"one":"{{count}} new topic."},"uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","banner":{"edit":"Edit this banner \u003e\u003e"},"queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval","other":"This topic has \u003cb\u003e{{count}}\u003c/b\u003e posts awaiting approval"},"approval":{"pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending."}}},"directory":{"total_rows":{"one":"1 user"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","title":{"one":"group"},"trust_levels":{"title":"Trust level automatically granted to members when they're added:"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"},"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}."}},"user_fields":{"none":"(select an option)"},"user":{"desktop_notifications":{"perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","each_browser_note":"Note: You have to change this setting on every browser you use."},"watched_categories_instructions":"You will automatically watch all new topics in these categories. You will be notified of all new posts and topics, and a count of new posts will also appear next to the topic.","tracked_categories_instructions":"You will automatically track all new topics in these categories. A count of new posts will appear next to the topic.","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_about":{"error":"There was an error changing ths value."},"change_avatar":{"cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"email_always":"Send me email notifications even when I am active on the site","invited":{"none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab":"Redeemed","redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab":"Pending","pending_tab_with_count":"Pending ({{count}})","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"},"avatar":{"header_title":"profile, messages, bookmarks and preferences"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","replies_lowercase":{"one":"reply"},"signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"private_message_info":{"remove_allowed_user":"Do you really want to remove {{name}} from this message?"},"login":{"rate_limit":"Please wait before trying to log in again.","to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","error":{"try_like":"Have you tried the \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e button?"},"reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","granted_badge":"Badge granted"},"popup":{"mentioned":"{{username}} mentioned you in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} quoted you in \"{{topic}}\" - {{site_title}}","replied":"{{username}} replied to you in \"{{topic}}\" - {{site_title}}","posted":"{{username}} posted in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sent you a private message in \"{{topic}}\" - {{site_title}}","linked":"{{username}} linked to your post from \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip":"select images from your device","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"no_more_results":"No more results found.","context":{"private_messages":"Search messages"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again","selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic."}},"none":{"search":"There are no search results."},"bottom":{"search":"There are no more search results."}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"new_topics":{"one":"1 new topic"},"unread_topics":{"one":"1 unread topic"},"total_unread_posts":{"one":"you have 1 unread post in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","progress":{"jump_bottom":"jump to last post"},"notifications":{"reasons":{"1_2":"You will be notified if someone mentions your @name or replies to you.","1":"You will be notified if someone mentions your @name or replies to you."},"watching_pm":{"description":"You will be notified of every new reply in this message, and a count of new replies will be shown."},"watching":{"description":"You will be notified of every new reply in this topic, and a count of new replies will be shown."},"tracking_pm":{"description":"A count of new replies will be shown for this message. You will be notified if someone mentions your @name or replies to you."},"tracking":{"description":"A count of new replies will be shown for this topic. You will be notified if someone mentions your @name or replies to you. "},"regular":{"description":"You will be notified if someone mentions your @name or replies to you."},"regular_pm":{"description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","confirm_pin":"You already have {{count}} pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic in this category?","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Users can unpin the topic individually for themselves.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","confirm_pin_globally":"You already have {{count}} globally pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic globally?","unpin_globally":"Remove this topic from the top of all topic lists.","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Users can unpin the topic individually for themselves.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Make this topic into a banner that appears at the top of all pages.","remove_banner":"Remove the banner that appears at the top of all pages.","banner_note":"Users can dismiss the banner by closing it. Only one topic can be bannered at any given time.","no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"invite_private":{"success":"We've invited that user to participate in this message."},"controls":"Topic Controls","invite_reply":{"help":"invite others to this topic via email or notifications","sso_enabled":"Enter the username of the person you'd like to invite to this topic.","to_topic_email":"You've entered an email address. We'll email an invitation that allows your friend to immediately reply to this topic.","to_topic_username":"You've entered a username. We'll send a notification with a link inviting them to this topic.","to_username":"Enter the username of the person you'd like to invite. We'll send a notification with a link inviting them to this topic.","success_email":"We mailed out an invitation to \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. We'll notify you when the invitation is redeemed. Check the invitations tab on your user page to keep track of your invites.","error":"Sorry, we couldn't invite that person. Perhaps they have already been invited? (Invites are rate limited)"},"filters":{"n_posts":{"one":"1 post"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"change_timestamp":{"error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)"},"gap":{"one":"view 1 hidden reply"},"has_replies":{"one":"{{count}} Reply"},"has_likes":{"one":"{{count}} Like"},"has_likes_title":{"one":"1 person liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?"}},"change_owner":"Change Ownership"},"actions":{"defer_flags":{"one":"Defer flag"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post"},"like":{"one":"You and 1 other liked this"},"vote":{"one":"You and 1 other voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post"},"like":{"one":"1 person liked this"},"vote":{"one":"1 person voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?"}}},"category":{"create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_map":{"clicks":{"one":"1 click"}},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"views_lowercase":{"one":"view"},"likes_lowercase":{"one":"like"},"users_lowercase":{"one":"user"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"voters":{"one":"voter","other":"voters"},"total_votes":{"one":"total vote","other":"total votes"},"average_rating":"Average rating: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"between_min_and_max_options":"You may choose between \u003cstrong\u003e%{min}\u003c/strong\u003e and \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"cast-votes":{"title":"Cast your votes","label":"Vote now!"},"show-results":{"title":"Display the poll results","label":"Show results"},"hide-results":{"title":"Back to your votes","label":"Hide results"},"open":{"title":"Open the poll","label":"Open","confirm":"Are you sure you want to open this poll?"},"close":{"title":"Close the poll","label":"Close","confirm":"Are you sure you want to close this poll?"},"error_while_toggling_status":"There was an error while toggling the status of this poll.","error_while_casting_votes":"There was an error while casting your votes."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"dashboard":{"mobile_title":"Mobile"},"flags":{"summary":{"action_type_3":{"one":"off-topic"},"action_type_4":{"one":"inappropriate"},"action_type_6":{"one":"custom"},"action_type_7":{"one":"custom"},"action_type_8":{"one":"spam"}}},"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"roll_up":"roll up IP blocks","change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}}},"impersonate":{"invalid":"Sorry, you may not impersonate that user."},"users":{"approved_selected":{"one":"approve user"},"reject_selected":{"one":"reject user"},"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"},"reject_successful":{"one":"Successfully rejected 1 user."},"reject_failures":{"one":"Failed to reject 1 user."}},"user":{"delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","category":"Post to Category","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile"}},"badges":{"badge_count":{"one":"1 Badge"},"more_badges":{"one":"+1 More"},"granted":{"one":"1 granted"},"badge":{"campaigner":{"description":"Invited 3 basic users (trust level 1)"},"champion":{"description":"Invited 5 members (trust level 2)"},"popular_link":{"description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'zh_TW';
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
// language : traditional chinese (zh-tw)
// author : Ben : https://github.com/ben-lin

moment.lang('zh-tw', {
    months : "一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),
    monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
    weekdays : "星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),
    weekdaysShort : "週日_週一_週二_週三_週四_週五_週六".split("_"),
    weekdaysMin : "日_一_二_三_四_五_六".split("_"),
    longDateFormat : {
        LT : "Ah點mm",
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
            return number + "週";
        default :
            return number;
        }
    },
    relativeTime : {
        future : "%s內",
        past : "%s前",
        s : "幾秒",
        m : "一分鐘",
        mm : "%d分鐘",
        h : "一小時",
        hh : "%d小時",
        d : "一天",
        dd : "%d天",
        M : "一個月",
        MM : "%d個月",
        y : "一年",
        yy : "%d年"
    }
});

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
