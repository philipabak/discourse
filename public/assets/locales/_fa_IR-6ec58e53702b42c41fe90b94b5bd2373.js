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
MessageFormat.locale.en = function ( n ) {
  if ( n === 1 ) {
    return "one";
  }
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
    })({"topic.read_more_MF" : function(){ return "Invalid Format: Plural Function not found for locale: fa_IR";} , "posts_likes_MF" : function(){ return "Invalid Format: Plural Function not found for locale: fa_IR";}});I18n.translations = {"fa_IR":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"other":"بایت"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1 دقیقه","less_than_x_seconds":{"other":"\u003c %{count} ثانیه"},"x_seconds":{"other":"%{count} ثانیه"},"less_than_x_minutes":{"other":"\u003c %{count} دقیقه"},"x_minutes":{"other":"%{count} دقیقه"},"about_x_hours":{"other":"%{count} ساعت"},"x_days":{"other":"%{count} روز"},"about_x_years":{"other":"%{count} سال"},"over_x_years":{"other":"\u003e %{count} سال"},"almost_x_years":{"other":"%{count} سال"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"other":"%{count} دقیقه"},"x_hours":{"other":"%{count} ساعت"},"x_days":{"other":"%{count} روز"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"other":"%{count} دقیقه پیش"},"x_hours":{"other":"%{count} ساعت پیش"},"x_days":{"other":"%{count} روز پیش"}},"later":{"x_days":{"other":"%{count} روز بعد"},"x_months":{"other":"%{count} ماه بعد"},"x_years":{"other":"%{count} سال بعد"}}},"share":{"topic":"پیوندی به این موضوع را به اشتراک بگذارید","post":"ارسال #%{postNumber}","close":"بسته","twitter":"این پیوند را در توییتر به اشتراک بگذارید.","facebook":"این پیوند را در فیسبوک به اشتراک بگذارید.","google+":"این پیوند را در Google+‎ به اشتراک بگذارید.","email":"این پیوند را با ایمیل بفرستید"},"topic_admin_menu":"اقدامات مدیریت موضوع","emails_are_disabled":"تمام ایمیل های خروجی بصورت کلی توسط مدیر قطع شده است. هیچگونه ایمیل اگاه سازی ارسال نخواهد شد.","edit":"سرنویس و دستهٔ این موضوع را ویرایش کنید","not_implemented":"آن ویژگی هنوز به کار گرفته نشده، متأسفیم!","no_value":"نه","yes_value":"بله","generic_error":"متأسفیم، خطایی روی داده.","generic_error_with_reason":"خطایی روی داد: %{error}","sign_up":"ثبت نام","log_in":"ورود","age":"سن","joined":"ملحق شده در","admin_title":"مدیر","flags_title":"پرچم‌ها","show_more":"بیش‌تر نشان بده","links":"پیوندها","links_lowercase":{"other":"پیوندها"},"faq":"پرسش‌های متداول","guidelines":"راهنماها","privacy_policy":"سیاست حریم خصوصی","privacy":"حریم خصوصی","terms_of_service":"شرایط استفاده از خدمات","mobile_view":"نمایش برای موبایل ","desktop_view":"نمایش برای کامپیوتر","you":"شما","or":"یا","now":"هم‌اکنون","read_more":"بیشتر بخوانید","more":"بیشتر","less":"کمتر","never":"هرگز","daily":"روزانه","weekly":"هفتگی","every_two_weeks":"هر دو هفته","every_three_days":"هر سه روز","max_of_count":"حداکثر {{count}}","alternation":"یا","character_count":{"other":"{{count}} نویسه"},"suggested_topics":{"title":"موضوعات پیشنهادی"},"about":{"simple_title":"درباره","title":"درباره %{title}","stats":"آمارهای سایت","our_admins":"مدیران  ما","our_moderators":"مدیران ما","stat":{"all_time":"تمام وقت","last_7_days":"7 روز اخیر","last_30_days":"30 روز گذشته"},"like_count":"لایک ها ","topic_count":"موضوعات","post_count":"پست ها","user_count":"کاربران جدید","active_user_count":"کاربران فعال","contact":"ارتباط با ما","contact_info":"در شرایط حساس و مسائل اضطراری مربوط به سایت٬‌ لطفا با تماس بگیرید از طریق %{contact_info}."},"bookmarked":{"title":"نشانک","clear_bookmarks":"پاک کردن نشانک ها","help":{"bookmark":"برای نشانک گذاری به اولین نوشته این موضوع مراجعه نمایید","unbookmark":"برای حذف تمام نشانک های این موضوع کلیک کنید"}},"bookmarks":{"not_logged_in":"متأسفیم، شما باید به وارد شوید تا روی نوشته ها نشانک بگذارید","created":"شما این نوشته ها را نشانک گذاشته‌اید","not_bookmarked":"شما این نوشته را خوانده‌اید؛ بفشارید تا روی آن نشانک بگذارید.","last_read":"این آخرین نوشته ای است که خوانده‌اید؛ بفشارید تا روی آن نشانک بگذارید.","remove":"پاک کردن نشانک","confirm_clear":"آیا مطمئنید که می‌خواهید همه نشانک ها را از این موضوع پاک کنید؟"},"topic_count_latest":{"other":"{{count}} موضوعات تازه یا به‌ روز شده."},"topic_count_unread":{"other":"{{count}} موضوعات خوانده نشده."},"topic_count_new":{"other":"{{count}} موضوعات تازه."},"click_to_show":"برای نمایش کلیک کنید.","preview":"پیش‌نمایش","cancel":"لغو","save":"ذخیره سازی تغییرات","saving":"در حال ذخیره سازی ...","saved":"ذخیره شد!","upload":"بارگذاری","uploading":"در حال بارگذاری...","uploaded":"بارگذاری شد!","enable":"فعال کردن","disable":"ازکاراندازی","undo":"برگردانی","revert":"برگشت","failed":"ناموفق","switch_to_anon":"حالت ناشناس ","banner":{"close":"این سردر را رد بده.","edit":"این بنر را ویرایش کنید \u003e\u003e"},"choose_topic":{"none_found":"موضوعی یافت نشد.","title":{"search":"جستجو برای یک موضوع از روی نام، نشانی (url) یا شناسه (id)","placeholder":"سرنویس موضوع را اینجا بنویسید"}},"queue":{"topic":"جستار","approve":"تصویب","reject":"رد کردن","delete_user":"پاک کردن کاربر","title":"به تایید نیاز است","none":"نوشته ای برای بازبینی وجود ندارد.","edit":"ویرایش","cancel":"لغو کردن","view_pending":"مشاهده پست های در انتظار ","has_pending_posts":{"other":"این عنوان دارای \u003cb\u003e{{count}}\u003c/b\u003e نوشته‌ی در انتظار تایید است"},"confirm":"ذخیره سازی تغییرها","delete_prompt":"آیا مطمئن هستی از پاک کردن این \u003cb\u003e%{username}\u003c/b\u003e? این باعث پاک شدن تمام پست ها و منجر به بلاک شدن ایمیل و IP می شود.","approval":{"title":"نوشته نیاز به تایید دارد","description":"ما نوشته شما را دریافت کرده ایم ولی نیاز به تایید آن توسط یکی از مدیران است قبل از اینکه نمایش داده شود. لطفا صبر داشته باشید.","pending_posts":{"other":"شما دارای  \u003cstrong\u003e{{count}}\u003c/strong\u003e  پست های در انتظار هستید "},"ok":"باشه"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003eنوشته شد\u003ca href='{{topicUrl}}'\u003eموضوع\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eشما\u003c/a\u003e در \u003ca href='{{topicUrl}}'\u003eاین موضوع\u003c/a\u003e نوشته گذاشتید","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e replied to \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e replied to \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e replied to \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e replied to \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mentioned \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mentioned \u003ca href='{{user2Url}}'\u003eyou\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eشما\u003c/a\u003e  نام برده شده اید \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Posted by \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Posted by \u003ca href='{{userUrl}}'\u003eyou\u003c/a\u003e","sent_by_user":"Sent by \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Sent by \u003ca href='{{userUrl}}'\u003eyou\u003c/a\u003e"},"directory":{"filter_name":"فیلتر بر اساس نام کاربری","title":"کاربران","likes_given":"داده","likes_received":"دریافت","topics_entered":"وارد شده","topics_entered_long":"موضوعات وارد شده","time_read":"زمان خوانده‌ شده","topic_count":"موضوعات","topic_count_long":"موضوعات ساخته شده","post_count":"پاسخ ها","post_count_long":"پاسخ ها نوشته شده","no_results":"نتیجه ای یافت نشد.","days_visited":"بازدید ها","days_visited_long":"بازدید روزانه","posts_read":"خواندن","posts_read_long":"خواندن نوشته ها","total_rows":{"other":"%{count} کاربران"}},"groups":{"visible":"همهٔ کاربران گروه را می‌بینند","title":{"other":"گروه‌ها"},"members":"اعضا","posts":"نوشته ها","alias_levels":{"title":"چه کسی می تواند این گروه به عنوان یک نام مستعار استفاده کند؟","nobody":"هیچ‌کس","only_admins":"تنها مدیران","mods_and_admins":"فقط گردانندگان و ادمین ها","members_mods_and_admins":"تنها کاربران گروه، مدیران ومدیران کل","everyone":"هرکس"}},"user_action_groups":{"1":"پسندهای داده شده","2":"پسندهای دریافت شده","3":"نشانک‌ها","4":"موضوعات","5":"پاسخ ها","6":"واکنش","7":"اشاره‌ها","9":"نقل‌قول‌ها","10":"ستاره‌دار","11":"ویرایش‌ها","12":"ارسال موارد","13":"صندوق دریافت","14":"در انتظار"},"categories":{"all":"همهٔ دسته‌بندی ها","all_subcategories":"همه","no_subcategory":"هیچی","category":"دسته بندی","posts":"نوشته ها","topics":"موضوعات","latest":"آخرین","latest_by":"آخرین توسط","toggle_ordering":"ضامن کنترل مرتب سازی","subcategories":"زیر دسته‌ بندی ها","topic_stats":"شمار موضوعات تازه.","topic_stat_sentence":{"other":"%{count} موضوعات تازه در %{unit} گذشته."},"post_stats":"تعداد نوشته های جدید.","post_stat_sentence":{"other":"%{count} نوشته تازه در %{unit} گذشته."}},"ip_lookup":{"title":"جستجوی نشانی IP","hostname":"نام میزبان","location":"موقعیت","location_not_found":"(ناشناس)","organisation":"سازمان","phone":"تلفن","other_accounts":"سایر حساب های کاربری با این ای پی .","delete_other_accounts":"حذف %{count}","username":"نام کاربری","trust_level":"TL","read_time":" زمان خواندن","topics_entered":"موضوعات وارد شده","post_count":"# نوشته ها","confirm_delete_other_accounts":"آیا مطمئن هستید که می خواهید این حساب کاربری را حذف نمایید؟"},"user":{"said":"{{username}}:","profile":"نمایه","mute":"بی صدا","edit":"ویرایش تنظیمات","download_archive":"دانلود نوشته های من","new_private_message":"پیام های جدید","private_message":"پیام","private_messages":"پیام‌ها","activity_stream":"فعالیت","preferences":"تنظیمات","bookmarks":"نشانک‌ها","bio":"درباره من","invited_by":"فراخوان از سوی","trust_level":"سطح اعتماد","notifications":"آگاه‌سازی‌ها","dismiss_notifications":"علامت گذاری همه به عنوان خوانده شده","dismiss_notifications_tooltip":"علامت گذاری همه اطلاعیه های خوانده نشده به عنوان خوانده شده","disable_jump_reply":"بعد از پاسخ من به پست من پرش نکن","dynamic_favicon":" تعداد موضوعات جدید یا بروز شده را روی آیکون مرورگر نمایش بده","edit_history_public":"اجازه بده کاربران دیگر اصلاحات نوشته مرا ببینند","external_links_in_new_tab":"همهٔ پیوندهای برون‌رو را در یک تب جدید باز کن","enable_quoting":"فعال کردن نقل قول گرفتن از متن انتخاب شده","change":"تغییر","moderator":"{{user}} یک مدیر است","admin":"{{user}} یک مدیر کل است","moderator_tooltip":"این کاربر یک مدیر است","admin_tooltip":"این کاربر یک ادمین است","suspended_notice":"این کاربر تا {{date}} در وضعیت معلق است.","suspended_reason":"دلیل: ","github_profile":"Github","mailing_list_mode":"برای هر نوشته جدید، ایمیلی برای من بفرست (مگر اینکه من موضوع یا دسته‌بندی را ساکت کنم)","watched_categories":"تماشا شده","watched_categories_instructions":"شما به صورت خودکار تمام نوشته‌های این دسته را مشاهده‌ خواهید کرد. به شما تمام عناوین و نوشته‌‌های جدید اطلاع رسانی خواهد شد، و تعداد نوشته‌های جدید هر عنوان در کنار آن نمایش داده می‌شود.","tracked_categories":"پی‌گیری شده","tracked_categories_instructions":"شما به صورت خودکار تمام عناوین جدید در این دسته را پیگیری خواهید کرد. تعداد نوشته های جدید در کنار عنواین نمایش داده می‌شود.","muted_categories":"بی صدا شد","delete_account":"حساب من را پاک کن","delete_account_confirm":"آیا مطمئنید که می‌خواهید شناسه‌تان را برای همیشه پاک کنید؟ برگشتی در کار نیست!","deleted_yourself":"حساب‌ کاربری شما با موفقیت حذف شد.","delete_yourself_not_allowed":"در حال حاضر شما نمی‌توانید حساب کاربری خود را حذف کنید. به این منظور  با یکی از مدیران برای پاک کردن حسابتان تماس بگیرید.","unread_message_count":"پیام‌ها","admin_delete":"پاک کردن","users":"کاربران","muted_users":"بی صدا شده","muted_users_instructions":"متفوقف کردن تمام اطلاعیه ها از طرف این کاربران.","staff_counters":{"flags_given":"پرچم گذاری های مفید","flagged_posts":"نوشته های پرچم گذاری شده","deleted_posts":"پست های حذف شده","suspensions":"تعلیق کردن","warnings_received":"هشدارها"},"messages":{"all":"همه","mine":"خودم","unread":"خوانده‌ نشده‌"},"change_password":{"success":"(ایمیل ارسال شد)","in_progress":"(فرستادن ایمیل)","error":"(خطا)","action":"ارسال ریست رمز عبور به ایمیل ","set_password":"تغییر کلمه عبور"},"change_about":{"title":"تغییر «دربارهٔ من»","error":"در فرایند تغییر این مقدار خطایی رخ داد."},"change_username":{"title":"تغییر نام کاربری","confirm":"اگر نام کاربری خود را تغییر دهید، همهٔ نقل‌قول‌های پیشین از نوشته‌های شما و اشاره‌های @name از کار می‌افتند. آیا برای انجام این کار اطمینان کامل دارید؟","taken":"متأسفیم، آن نام کاربری  قبلا گرفته شده است.","error":"در فرآیند تغییر نام کاربری شما خطایی روی داد.","invalid":"آن نام کاربری نامعتبر است. تنها باید عددها و حرف‌ها را در بر بگیرد."},"change_email":{"title":"تغییر ایمیل","taken":"متأسفیم، آن ایمیل در دسترس نیست.","error":"در تغییر ایمیلتان  خطایی روی داد. شاید آن نشانی از پیش در حال استفاده است؟","success":"ما ایمیلی به آن نشانی فرستاده‌ایم. لطفاً دستورکار تأییده را در آن دنبال کنید."},"change_avatar":{"title":"عکس نمایه خود را تغییر دهید","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eگراواتا\u003c/a\u003e, بر اساس","gravatar_title":"تصویرتان را در سایت Gravatar تغییر دهید","refresh_gravatar_title":"تازه‌سازی گراواتارتان","letter_based":"سیستم تصویر پرفایل را اختصاص داده است","uploaded_avatar":"تصویر شخصی","uploaded_avatar_empty":"افزودن تصویر شخصی","upload_title":"تصویرتان را بار بگذارید","upload_picture":"بارگذاری تصویر","image_is_not_a_square":"اخطار: ما تصویر شما بریدیم; طول و عرض برابر نبود."},"change_profile_background":{"title":"پس‌زمینه نمایه","instructions":"تصاویر پس‌زمینه نمایه‌ها در مرکز قرار میگیرند و به صورت پیش‌فرض طول 850px دارند."},"change_card_background":{"title":"پس زمینه کارت کابر","instructions":"تصاویر پس زمینه در مرکز قرار خواهند گرفت و عرض  پیشفرض آن 590 پیکسل است"},"email":{"title":"ایمیل","instructions":"هرگز بصورت عمومی نشان نده","ok":"ایمیلی برای تایید برایتان می‌فرستیم","invalid":"لطفا یک آدرس ایمیل معتبر وارد کنید","authenticated":"ایمیل شما تصدیق شد توسط {{provider}}"},"name":{"title":"نام","instructions":"نام کامل (اختیاری)","instructions_required":"نام کامل شما","too_short":"نام انتخابی شما خیلی کوتاه است","ok":"نام انتخابی شما به نطر می رسد خوب است"},"username":{"title":"نام کاربری","instructions":"منحصر به فرد،بدون فاصله،کوتاه","short_instructions":"می توانید به کاربران دیگر اشاره کنید با@{{username}}","available":"نام کاربری شما موجود است","global_match":"ایمیل منطبق نام کاربری ثبت شد.","global_mismatch":"از پیش ثبت شده.این را امتحان کن {{suggestion}} ؟","not_available":"فراهم نیست. این را امتحان کن {{suggestion}} ؟","too_short":"نام کاربری انتخابی شما خیلی کوتاه است","too_long":"نام کاربری انتخابی شما بسیار بلند است","checking":"بررسی فراهمی نام‌کاربری...","enter_email":"نام کاربری پیدا شد; ایمیل منطبق را وارد کن","prefilled":"ایمیل منطبق است با این نام کاربری ثبت شده "},"locale":{"title":"زبان رابط کاربر","instructions":"زبان رابط کاربری. با تازه کردن صفحه تغییر خواهد کرد.","default":"(پیش‌فرض)"},"password_confirmation":{"title":"رمز عبور را مجدد وارد نمایید"},"last_posted":"آخرین نوشته","last_emailed":"آخرین ایمیل فرستاده شده","last_seen":"مشاهده","created":"عضو شده","log_out":"خروج","location":"موقعیت","card_badge":{"title":"کارت مدال کاربر"},"website":"تارنما","email_settings":"ایمیل","email_digests":{"title":"هنگامی که به سایت سر نمی‌زنم، گزارش کوتاهی از رویدادهای تازه را برایم ایمیل کن:","daily":"روزانه","every_three_days":"هر سه روز","weekly":"هفتگی","every_two_weeks":"هر دو هفته "},"email_direct":"به من ایمیل ارسال کن هنگامی که کسی از من نقل قول کرد، به نوشته های من پاسخ داد، یا به من اشاره کرد @username یا مرا به موضوعی دعوت کرد.","email_private_messages":"به من ایمیل ارسال کن وقتی کسی به من پیام خصوصی فرستاد","email_always":"ایمیل های اعلان را وقتی در سایت فعال هستم برای من بفرست","other_settings":"موارد دیگر","categories_settings":"دسته‌بندی ها","new_topic_duration":{"label":"موضوعات را جدید در نظر بگیر وقتی","not_viewed":"من هنوز آن ها را ندیدم","last_here":"آخرین باری که اینجا بودم ساخته شده‌اند"},"auto_track_topics":"دنبال کردن خودکار موضوعاتی که وارد می‌شوم","auto_track_options":{"never":"هرگز","immediately":"فورا"},"invited":{"search":"بنویسید تا فراخوانه‌ها را جستجو کنید...","title":"فراخوانه‌ها","user":"کاربر فراخوانده شده","redeemed":"آزاد سازی دعوتنامه","redeemed_tab":"آزاد شده","redeemed_at":"آزاد سازی","pending":"دعوت های بی‌پاسخ","pending_tab":"در انتظار","topics_entered":"موضوعات بازدید شد","posts_read_count":"خواندن نوشته ها","expired":"این دعوت منقضی شده است.","rescind":"پاک کردن","rescinded":"فراخوانه پاک شد","reinvite":"ارسال دوباره دعوت","reinvited":"فرستادن دوباره دعوتنامه","time_read":"زمان خواندن","days_visited":"روز های بازدید شده","account_age_days":"عمر حساب بر اساس روز","create":"فرستادن یک دعوتنامه","bulk_invite":{"none":"شما هنوز کسی را اینجا دعوت نکرده اید. می توانید بصورت تکی یا گروهی یکجا دعوتنامه را بفرستید از طریق  \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eبارگذار فراخوانه فله ای \u003c/a\u003e.","text":"دعوت گروهی از طریق فایل","uploading":"بارگذاری...","success":"فایل با موفقیت بارگذاری شد٬  وقتی که پروسه تمام شد  به شما را از طریق پیام اطلاع می دهیم. ","error":"در بارگذاری «{{filename}}» خطایی روی داد: {{message}}"}},"password":{"title":"رمزعبور","too_short":"رمز عبورتان خیلی کوتاه است","common":"رمز عبور خیلی ساده‌ای است","same_as_username":"رمز عبورتان با نام کاربری شما برابر است.","same_as_email":"رمز عبورتان با ایمیل شما برابر است. ","ok":"گذرواژهٔ خوبی است.","instructions":"در آخرین %{count} کاراکتر"},"associated_accounts":"ورود ها","ip_address":{"title":"آخرین نشانی IP"},"registration_ip_address":{"title":"نشانی IP ثبت‌نامی"},"avatar":{"title":"عکس نمایه","header_title":"پروفایل، پیام‌ها، نشانک‌ها و ترجیحات"},"title":{"title":"سرنویس"},"filters":{"all":"همه"},"stream":{"posted_by":"فرستنده:","sent_by":"فرستنده:","private_message":"پیام","the_topic":"موضوع"}},"loading":"بارگذاری","errors":{"prev_page":"هنگام تلاش برای بارگزاری","reasons":{"network":"خطای شبکه","server":"خطای سرور","forbidden":"دسترسی قطع شده است","unknown":"خطا"},"desc":{"network":"ارتباط اینترنتی‌تان را بررسی کنید.","network_fixed":"به نظر می رسد اون برگشت.","server":"کد خطا : {{status}}","forbidden":"شما اجازه دیدن آن را ندارید.","unknown":"اشتباهی روی داد."},"buttons":{"back":"برگشت","again":"تلاش دوباره","fixed":"بارگذاری برگه"}},"close":"بستن","assets_changed_confirm":"این وب سایت به روز رانی شده است،بارگزاری مجدد کنید برای آخرین نسخه ؟","logout":"شما از سایت خارج شده اید","refresh":"تازه کردن","read_only_mode":{"enabled":"حالت فقط خواندن را فعال است. می توانید به جستجو در وب سایت ادامه دهید ولی ممکن است تعاملات کار نکند.","login_disabled":"ورود به سیستم غیر فعال شده همزمان با اینکه سایت در حال فقط خواندنی است."},"learn_more":"بیشتر بدانید...","year":"سال","year_desc":"موضوعاتی که در 365 روز گذشته باز شده‌اند","month":"ماه","month_desc":"موضوعاتی که در 30 روز گذشته ساخته شده اند","week":"هفته","week_desc":"موضوعاتی که در 7 روز گذشته باز شده‌اند","day":"روز","first_post":"نوشته نخست","mute":"بی صدا","unmute":"صدادار","last_post":"آخرین نوشته","last_reply_lowercase":"آخرین پاسخ","replies_lowercase":{"other":"پاسخ ها "},"summary":{"enabled_description":"شما خلاصه ای از این موضوع را می بینید:  بالاترین‌ نوشته های  انتخاب شده توسط انجمن.","description":"\u003cb\u003e{{count}}\u003c/b\u003e پاسخ","description_time":"وجود دارد \u003cb\u003e{{count}}\u003c/b\u003e پاسخ ها برا اساس زمان خواندن\u003cb\u003e{{readingTime}} دقیقه\u003c/b\u003e.","enable":"خلاصه این موضوع","disable":"نمایش همه نوشته‌ها"},"deleted_filter":{"enabled_description":"محتویات این موضوع باعث حذف نوشته شده٬ که پنهان شده است.","disabled_description":"پست های حذف شده در موضوع نشان داده است","enable":"مخفی کردن نوشته های حذف شده","disable":"نشان دادن نوشته های حذف شده"},"private_message_info":{"title":"پیام","invite":"فراخواندن دیگران...","remove_allowed_user":"آیا واقعا می خواهید اسم {{name}} از پیام برداشته شود ؟ "},"email":"رایانامه","username":"نام کاربری","last_seen":"مشاهده شد","created":"ساخته شده","created_lowercase":"ساخته شده","trust_level":"سطح اعتماد","search_hint":"نام کاربری ، ایمیل یا ای پی ","create_account":{"title":"ساختن شناسهٔ تازه","failed":"اشتباهی روی داده، شاید این نام کاربری پیش‌تر استفاده شده؛ پیوند فراموشی گذرواژه می‌تواند کمک کند."},"forgot_password":{"title":"باز یابی کلمه عبور","action":"گذرواژه‌ام را فراموش کرده‌ام","invite":"نام‌کاربری و نشانی رایانامهٔ خود را بنویسید و ما رایانامهٔ بازیابی گذرواژه را برایتان می‌فرستیم.","reset":"باز یابی رمز عبور","complete_username":"اگر حساب کاربری مشابه نام کاربری  \u003cb\u003e%{username}\u003c/b\u003e ,است،شما باید با استفاده از ایمیل رمز عبور حساب کاربری خود را مجدد تنظیم نمایید.","complete_email":"اگر حساب کاربری مشابه ایمیل \u003cb\u003e%{email}\u003c/b\u003e, است،شما باید با استفاده از ایمیل رمز عبور حساب کاربری خود را مجدد تنظیم نمایید.","complete_username_found":"ما حساب کاربری مشابه نام کاربری   \u003cb\u003e%{username}\u003c/b\u003e,پیدا کردیم،شما باید با استفاده از ایمیل رمز عبور حساب کاربری خود را مجدد تنظیم نمایید.","complete_email_found":"ما حساب کاربری مشابه با ایمیل  \u003cb\u003e%{email}\u003c/b\u003e, پیدا کردیم،شما باید با استفاده از ایمیل رمز عبور حساب کاربری خود را مجدد تنظیم نمایید.","complete_username_not_found":"هیچ حساب کاربری مشابه نام کاربری \u003cb\u003e%{username}\u003c/b\u003e وجود ندارد","complete_email_not_found":"هیچ حساب کاربری مشابه با \u003cb\u003e%{email}\u003c/b\u003e وجود ندارد"},"login":{"title":"ورود","username":"کاربر","password":"گذرواژه","email_placeholder":"نشانی رایانامه یا نام کاربری","caps_lock_warning":"Caps Lock روشن است","error":"خطای ناشناخته","rate_limit":"لطفا قبل از ورود مجدد اندکی صبر کنید","blank_username_or_password":"لطفا نام کاربری یا ایمیل خود ، با پسورد وارد نمایید.","reset_password":"نوسازی گذرواژه","logging_in":"درون آمدن...","or":"یا","authenticating":"اعتبارسنجی...","awaiting_confirmation":"شناسهٔ‌کاربری‌تان چشم به راه فعال‌سازی است، پیوند فراموشی گذرواژه را برای دریافت یک رایانامهٔ‌فعال‌سازی دیگر باز کنید.","awaiting_approval":"هنوز کارمندی شناسهٔ‌شما را تأیید نکرده است. پس از تأیید، یک رایانامه دریافت خواهید کرد.","requires_invite":"متأسفیم، دسترسی به این انجمن تنها با فراخوانه امکان دارد.","not_activated":"هنوز نمی‌توانید به درون بیایید. پیش‌تر یک رایانامهٔ فعال‌سازی برایتان به نشانی \u003cb\u003e{{sentTo}}\u003c/b\u003e فرستادیم. لطفاً دستور کار آن رایانامه را برای فعال‌سازی شناسه‌تان دنبال کنید.","not_allowed_from_ip_address":"شما نمی توانید با این اپی ادرس وارد شوید.","admin_not_allowed_from_ip_address":"شما نمی تواند با این اپی آدرس وارد کنترل  پنل ادمین شوید.","resend_activation_email":"برای فرستادن دوبارهٔ رایانامهٔ‌فعال‌سازی، اینجا را بفشارید.","sent_activation_email_again":"رایانامهٔ‌ فعال‌سازی دیگری را برایتان به نشانی \u003cb\u003e{{currentEmail}}\u003c/b\u003e فرستادیم. چند دقیقه‌ای طول می‌کشد تا برسد. مطمئن شوید که پوشهٔ هرزنامه را بررسی می‌کنید.","google":{"title":"با Google","message":"اعتبارسنجی با گوگل (مطمئن شوید که بازدارنده‌های pop up فعال نباشند)"},"google_oauth2":{"title":"با گوگل","message":"اهراز هویت با گوگل (لطفا برسی کنید پاپ بلوکر فعال نباشد)"},"twitter":{"title":"با Twitter","message":"اعتبارسنجی با توئیتر (مطمئن شوید که بازدارنده‌های pop up فعال نباشند)"},"facebook":{"title":"با Facebook","message":"اعتبارسنجی با فیسبوک (مطمئن شوید که بازدارنده‌های pop up فعال نباشند)"},"yahoo":{"title":"با یاهو","message":"اعتبارسنجی با یاهو (مطمئن شوید که بازدارنده‌های pop up فعال نباشند)"},"github":{"title":"با GitHub","message":"اعتبارسنجی با گیت‌هاب (مطمئن شوید که بازدارنده‌های pop up فعال نباشند)"}},"apple_international":"اپل / بین المللی","google":"گوگل","twitter":"تویتر","emoji_one":"یک شکلک","composer":{"emoji":"شکلک :smile:","add_warning":"این یک هشدار رسمی است.","posting_not_on_topic":"به کدام موضوع می‌خواهید پاسخ دهید؟","saving_draft_tip":"در حال ذخیره سازی ...","saved_draft_tip":"اندوخته شد","saved_local_draft_tip":"ذخیره سازی به صورت محلی","similar_topics":"موضوع شما شبیه است به...","drafts_offline":"پیش نویس آنلاین","error":{"title_missing":"سرنویس الزامی است","title_too_short":"سرنویس دست‌کم باید {{min}} نویسه باشد","title_too_long":"سرنویس نمی‌تواند بیش‌تر از {{max}} نویسه باشد","post_missing":"نوشته نمی‌تواند تهی باشد","post_length":"نوشته باید دست‌کم {{min}} نویسه داشته باشد","try_like":"این کلید را امتحان کرده اید \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e ؟ ","category_missing":"باید یک دسته برگزینید"},"save_edit":"ذخیره سازی ویرایش","reply_original":"پاسخ دادن در موضوع اصلی","reply_here":"پاسخ‌دادن همین‌جا","reply":"پاسخ","cancel":"لغو کردن","create_topic":"ایجاد موضوع","create_pm":"پیام","title":"یا Ctrl+Enter را بفشارید","users_placeholder":"افزودن یک کاربر","title_placeholder":"در یک جملهٔ‌ کوتاه، این موضوع در چه موردی است؟","edit_reason_placeholder":"چرا ویرایش می‌کنید؟","show_edit_reason":"(افزودن دلیل ویرایش)","view_new_post":"نوشته تازه‌تان را ببینید.","saved":"اندوخته شد!","saved_draft":"در حال حاضر پیشنویس وجود دارد . برای از سر گیری انتخاب نمایید.","uploading":"بارگذاری...","show_preview":"نشان دادن پیش‌نمایش \u0026laquo;","hide_preview":"\u0026raquo; پنهان کردن پیش‌نمایش","quote_post_title":"نقل‌قول همهٔ‌ نوشته","bold_title":"زخیم","bold_text":"نوشته قوی ","italic_title":"تاکید","italic_text":"متن تاکید شده","link_title":"لینک ارتباط دار","link_description":"توضیحات لینک را اینجا وارد کنید.","link_dialog_title":"لینک را درج کنید","link_optional_text":"سرنویس اختیاری","quote_title":"نقل قول","quote_text":"نقل قول","code_title":"نوشته تنظیم نشده","code_text":"متن تورفتگی تنظیم نشده توسط 4 فضا خالی","upload_title":"بارگذاری","upload_description":"توضیح بارگذاری را در اینجا بنویسید","olist_title":"لیست شماره گذاری شد","ulist_title":"لیست بولت","list_item":"فهرست موارد","heading_title":"عنوان","heading_text":"عنوان","hr_title":"خط کش افقی","help":"راهنمای ویرایش با Markdown","toggler":"مخفی یا نشان دادن پنل نوشتن","admin_options_title":"تنظیمات اختیاری مدیران برای این موضوع","auto_close":{"label":"بستن خودکار موضوع در زمان :","error":"لطفا یک مقدار معتبر وارد نمایید.","based_on_last_post":"آیا تا آخرین نوشته یک موضوع بسته نشده در این قدیمی است.","all":{"examples":"عدد ساعت را وارد نمایید (24)،زمان کامل (17:30) یا برچسب زمان (2013-11-22 14:00)."},"limited":{"units":"(# از ساعت ها)","examples":"لطفا عدد ساعت را وارد نمایید (24)."}}},"notifications":{"title":"اطلاع رسانی با اشاره به @name ،پاسخ ها به نوشته ها و موضوعات شما،پیام ها ، و ...","none":"قادر به بار گذاری آگاه سازی ها در این زمان نیستیم.","more":"دیدن آگاه‌سازی‌های پیشن","total_flagged":"همهٔ نوشته‌های پرچم خورده","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eEarned '{{description}}'\u003c/p\u003e","popup":{"mentioned":"{{username}} mentioned you in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} quoted you in \"{{topic}}\" - {{site_title}}","replied":"{{username}} replied to you in \"{{topic}}\" - {{site_title}}","posted":"{{username}} posted in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sent you a private message in \"{{topic}}\" - {{site_title}}","linked":"{{username}} linked to your post from \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"افزودن یک عکس","title_with_attachments":"افزودن یک تصویر یا پرونده","from_my_computer":"از دستگاه من","from_the_web":"از وب","remote_tip":"لینک به تصویر","local_tip":"عکس ها را از روی سیستم خود انتخاب کنید","hint":"(برای آپلود می توانید فایل را کیشده و در ویرایشگر رها کنید)","uploading":"در حال بروز رسانی ","select_file":"انتخاب فایل","image_link":"به لینک تصویر خود اشاره کنید"},"search":{"title":"جستجوی موضوعات، نوشته ها، کاربران یا دسته‌ بندی ها","no_results":"چیزی یافت نشد.","no_more_results":"نتایجی بیشتری یافت نشد.","search_help":"راهنمای جستجو","searching":"جستجو کردن...","post_format":"#{{post_number}} توسط {{username}}","context":{"user":"جستجوی نوشته‌ها با @{{username}}","category":"جستجوی دستهٔ «{{category}}»","topic":"جستجوی این موضوع","private_messages":"جستجوی پیام"}},"go_back":"برگردید","not_logged_in_user":"صفحه کاربر با خلاصه ای از فعالیت های و تنظیمات","current_user":"به نمایه‌تان بروید","topics":{"bulk":{"reset_read":"تنظیم مجدد خوانده شد","delete":"حذف موضوعات","dismiss_new":"بستن جدید","toggle":"ضامن انتخاب یکباره موضوعات","actions":"عملیات یکجا","change_category":"تغییر دسته بندی","close_topics":"بستن موضوعات","archive_topics":"آرشیو موضوعات","notification_level":"تغییر سطح آگاه‌سازی","choose_new_category":"یک دسته بندی جدید برای موضوع انتخاب نمایید","selected":{"other":"شما تعداد \u003cb\u003e{{count}}\u003c/b\u003e موضوع را انتخاب کرده اید."}},"none":{"unread":"موضوع خوانده نشده‌ای ندارید.","new":"شما هیچ موضوع تازه‌ای ندارید","read":"هنوز هیچ موضوعاتی را نخوانده‌اید.","posted":"هنوز در هیچ موضوعی  نوشته نگذاشته‌اید.","latest":"هیچ موضوع تازه‌ای نیست. چه بد!","hot":"هیچ موضوع داغی نیست.","bookmarks":"هنوز هیچ موضوع نشانک‌گذاری شده‌ای ندارید.","category":"هیچ موضوعاتی در {{category}} نیست.","top":"موضوع برتر وجود ندارد.","search":" هیچ نتیجه جستجویی وجود ندارد.","educate":{"new":"\u003cp\u003eموضوعات جدید در اینجا قرار می گیرند.\u003c/p\u003e\u003cp\u003eبه طور پیش فرض، موضوعات جدید در نظر گرفته خواهند شد و نشان داده می شوند \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eجدید\u003c/span\u003e شاخص اگر آنها در 2 روز گذشته ایجاد شده باشند \u003c/p\u003e\u003cp\u003eشما می توانید این را برای خود تغییر دهید \u003ca href=\"%{userPrefsUrl}\"\u003eتنظیمات\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eموضوعات خوانده نشده شما در اینجا قرار می گیرند.\u003c/p\u003e\u003cp\u003eبه طور پیش فرض، موضوعات خوانده نشده در نظر گرفته خواهند شد و شمارش خوانده نشده ها نشان داده می شود \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e اگر شما:\u003c/p\u003e\u003cul\u003e\u003cli\u003eموضوع ایجاد کرده اید\u003c/li\u003e\u003cli\u003eبه موضوع پاسخ داده اید\u003c/li\u003e\u003cli\u003eخواندن موضوع  در بیش از 4 دقیقه\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eو یا اگر شما به صراحت مجموعه ای از موضوع مورد ردیابی و یا تماشا از طریق کنترل اطلاع رسانی در پایین هر موضوع انتخاب کرده اید.\u003c/p\u003e\u003cp\u003eشما می توانید این را تغییر دهید. \u003ca href=\"%{userPrefsUrl}\"\u003eتنظیمات\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"موضوع تازهٔ دیگری نیست.","hot":"موضوع داغ دیگری نیست.","posted":"هیچ موضوعات نوشته شده  ای وجود ندارد","read":"موضوع خوانده شدهٔ‌ دیگری نیست.","new":"موضوع تازهٔ دیگری نیست.","unread":"موضوع خوانده نشدهٔ دیگری نیست.","category":"هیچ موضوع دیگری در {{category}} نیست.","top":"بالاترین‌ موضوعات بیشتری وجود ندارد","bookmarks":"موضوعات نشانک‌گذاری شده‌ی دیگری وجود ندارد.","search":"نتیجه جستجوی دیگری وجود ندارد"}},"topic":{"filter_to":"نوشته در موضوع {{post_count}}  ","create":"موضوع جدید","create_long":"ساخت یک موضوع جدید","private_message":"شروع یک پیام","list":"موضوعات","new":"موضوع تازه","unread":"خوانده نشده","new_topics":{"other":"{{count}} موضوعات جدید"},"unread_topics":{"other":"{{count}} موضوع خوانده نشده"},"title":"موضوع","invalid_access":{"title":"موضوع خصوصی است","description":"متأسفیم، شما دسترسی به این موضوع ندارید!","login_required":"برای مشاهده‌ی موضوع باید وارد سیستم شوید."},"server_error":{"title":"شکست در بارگذاری موضوع","description":"متأسفیم، نتوانستیم موضوع را بار بگذاریم، شاید به دلیل یک مشکل ارتباطی. لطفاً دوباره تلاش کنید. اگر مشکل پابرجا بود، ما را آگاه کنید."},"not_found":{"title":"موضوع یافت نشد","description":"متأسفیم، نتوانستیم آن موضوع را بیابیم. شاید کارمندی آن را پاک کرده؟"},"total_unread_posts":{"other":"شما تعداد {{count}} نوشته خوانده نشده در این موضوع دارید"},"unread_posts":{"other":"شما تعداد {{count}} نوشته خوانده نشده قدیمی در این موضوع دارید"},"new_posts":{"other":"تعداد {{count}} نوشته های جدید در این موضوع از آخرین خواندن شما وجود دارد"},"likes":{"other":"{{count}} پسند در این موضوع داده شده است"},"back_to_list":"بازگشت به فهرست موضوع","options":"گزینه‌های موضوع","show_links":"نمایش پیوندهای درون این موضوع","toggle_information":" ضامن جزئیات موضوع","read_more_in_category":"می خواهید بیشتر بخوانید? به موضوعات دیگر را مرور کنید {{catLink}} یا {{latestLink}}.","read_more":"می خواهید بیشتر بخوانید? {{catLink}} یا {{latestLink}}.","browse_all_categories":"جستوجوی همهٔ دسته‌ها","view_latest_topics":"مشاهده آخرین موضوع","suggest_create_topic":"چرا یک موضوع نسازید؟","jump_reply_up":"رفتن به جدید ترین پاسخ","jump_reply_down":"رفتن به آخرین پاسخ","deleted":"موضوع پاک شده است.","auto_close_notice":"این موضوع خودکار بسته خواهد شد %{timeLeft}.","auto_close_notice_based_on_last_post":"این نوشته بعد از  %{duration} آخرین پاسخ بشته خواهد شد .","auto_close_title":"تنضیمات قفل خوکار","auto_close_save":"‌ذخیره","auto_close_remove":"این موضوع را خوکار قفل نکن","progress":{"title":"نوشته ی در حال اجرا","go_top":"بالا","go_bottom":"پایین","go":"برو","jump_bottom":"پرش به آخرین نوشته","jump_bottom_with_number":"رفتن به نوشته ی %{post_number}","total":"همهٔ نوشته‌ها","current":"نوشته کنونی","position":"نوشته %{current} از %{total}"},"notifications":{"reasons":{"3_6":"شما آگاه‌سازی‌ها را دریافت خواهید کرد، زیرا شما در حال مشاهده ی این  دسته بندی هستید.","3_5":"شما آگاه‌سازی‌ها را دریافت خواهید کرد، زیرا تماشای خودکار این موضوع را آغاز کرده‌اید.","3_2":"شما آگاه سازی دریافت می کنید زیرا در حال مشاهده این جستار هستید.","3_1":"از آنجا که این موضوع را ساخته‌اید، از رویدادهای آن آگاه خواهید شد.","3":"از آنجا که این موضوع را تماشا می‌کنید، از رویدادهای آن آگاه خواهید شد.","2_8":"شما آگاه سازی دریافت خواهید کرد چرا که شما این دسته بندی را پی گیری می کنید.","2_4":"از آنجا که به این جستار پاسخ فرستادید، از رویدادهای آن آگاه خواهید شد.","2_2":"از آنجا که این موضوع را دنبال می‌کنید، از رویدادهای آن آگاه خواهید شد.","2":"شما اطلاعیه ای دریافت خواهید کرد چون  \u003ca href=\"/users/{{username}}/preferences\"\u003eاین موضوع را مطالعه می نمایید\u003c/a\u003e.","1_2":"در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد به شما اطلاع داده خواهد شد.","1":"در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد به شما اطلاع داده خواهد شد.","0_7":"شما تمام آگاه سازی های این دسته بندی را نادیده گرفته اید","0_2":"شما کل آگاه سازی های این جستار را نادیده گرفته اید","0":"شما تمام آگاه سازی های این جستار را نادیده گرفته اید"},"watching_pm":{"title":"در حال مشاهده","description":"هر پاسخ جدید به این پیام به اطلاع شما خواهد رسید، و تعداد پاسخ‌های جدید نیز نمایش داده خواهد شد."},"watching":{"title":"در حال مشاهده","description":"هر پاسخ جدید در این عنوان به اطلاع شما خواهد رسید، و تعداد پاسخ‌های جدید نیز نمایش داده خواهد شد."},"tracking_pm":{"title":"ردگیری","description":"تعداد پاسخ‌های جدید برای این پیام نمایش داده خواهد شد. در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد، به شما اطلاع رسانی خواهد شد."},"tracking":{"title":"ردگیری","description":"تعداد پاسخ‌های جدید برای این عنوان نمایش داده خواهد شد. در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد، به شما اطلاع رسانی خواهد شد."},"regular":{"description":"در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد به شما اطلاع داده خواهد شد."},"regular_pm":{"description":"در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد به شما اطلاع داده خواهد شد."},"muted_pm":{"title":"بی صدا شد","description":" در باره این پیام هرگز  به شما اطلاع رسانی نخواهید شد"},"muted":{"title":"بی صدا شد"}},"actions":{"recover":"بازیابی موضوع","delete":"پاک کردن موضوع","open":"باز کردن موضوع ","close":"بستن موضوع","multi_select":"گزیدن دیدگاه‌ها...","auto_close":"بستن خودکار","pin":"سنجاق زدن جستار...","unpin":"برداشتن سنجاق جستار...","unarchive":"موضوع بایگانی نشده","archive":"بایگانی کردن موضوع","invisible":"خارج کردن از لیست","visible":"فهرست ساخته شد","reset_read":"تنظیم مجدد خواندن داده ها"},"feature":{"pin":"سنجاق زدن جستار","unpin":"برداشتن سنجاق جستار","pin_globally":"سنجاق کردن موضوع در سطح سراسری","make_banner":"اعلان موضوع","remove_banner":"حذف اعلان موضوع"},"reply":{"title":"پاسخ","help":"آغاز ارسال یک پاسخ به این موضوع"},"clear_pin":{"title":"برداشتن سنجاق","help":"سنجاق استاتوس این موضوع را بردارید که پس از آن دیگر این موضوع در بالای فهرست موضوعات شما دیده نمی‌شود."},"share":{"title":"همرسانی ","help":"همرسانی  یک پیوند برای این موضوع"},"flag_topic":{"title":"پرچم","help":"پرچم خصوصی برای این موضوع جهت توجه یا برای ارسال آگاه سازی شخصی در باره آن.","success_message":"شما باموفقیت این موضوع را پرچم زدید"},"feature_topic":{"title":" ویژگی های این موضوع","confirm_pin":"شما قبلا این  {{count}} موضوع را سنجاق کردید. تعداد زیاد موضوع های سنجاق شده شاید برای کاربران جدید یا ناشناس بار سنگینی ایجاد کند. آیا شما اطمینان دارید از سنجاق کردن یک موضوع دیگر در این دسته بندی ؟","unpin":"این موضوع را از لیست بالاترین‌ های دسته بندی {{categoryLink}} حذف کن","pin_note":"کاربران می توانند موضوع را بصورت جداگانه برای خود از سنجاق در بیاورند","confirm_pin_globally":"شما قبلا این موضوع {{count}} را بصورت سراسری سنجاق زده اید. تعداد زیاد موضوع های سنجاق شده برای کاربران جدید و ناشناس می تواند سخت باشد. آیا از سنجاق کردن موضوع ها بصورت سراری اطمینان دارید ؟  ","unpin_globally":"حذف این موضوع از بالای همه لیست موضوعات.","global_pin_note":"کاربران می توانند موضوع را بصورت جداگانه برای خود از سنجاق در بیاورند","make_banner":"این موضوع را در وارد بنر کن که در تمام صفحات در بالای صفحه نشان داده شود","remove_banner":"حذف بنری که از بالای تمام صفحات نمایش داده می شود. ","banner_note":"کاربران می توانند بنر را با بستن آنها رد کنند. فقط یک موضوع را می توان  بنر کرد در هرزمان داده شده ای. "},"inviting":"فراخوانی...","automatically_add_to_groups_optional":"این دعوتنامه دارای دسترسی به این گروه ها است : (اختیاری٬ فقط ادمین)","automatically_add_to_groups_required":"این دعوتنامه دارای دسترسی به این گروه ها است : (\u003cb\u003eRequired\u003c/b\u003e, admin only)","invite_private":{"title":"دعوت به پیام خصوصی","email_or_username":"دعوتنامه ی ایمیل یا نام کاربر","email_or_username_placeholder":"نشانی ایمیل یا نام کاربری","action":"دعوتنامه ","success":"ما آن کاربر را برای شرکت در این پیام دعوت کردیم.","error":"با معذرت٬ یک خطا برای دعوت آن کاربر وجود داشت","group_name":"نام گروه"},"invite_reply":{"title":"دعوتنامه ","username_placeholder":"نام کاربری","action":"ارسال دعوتنامه ","help":"دعوت دیگران به این موضوع با ایمیل یا اطلاعیه ","to_forum":"ما ایملی کوتاه برای شما می فرستیم که دوست شما با کلیک کردن بر روی لینک سریعا ملحق شود٫‌ به ورود سیستم نیازی نیست. ","sso_enabled":"نام کاربری کسی را که می خواهید برای این موضوع دعوت کنید را وارد نمایید","to_topic_blank":"نام کاربری یا ایمیل کسی را که می خواهید برای این موضوع دعوت کنید را وارد نمایید","to_topic_email":"شما یک ایمیل آدرس وارد کردید. ما یک ایمیل خواهیم فرستاد که به دوستان شما اجازه می دهد سریعا به این جستار پاسخ دهند.","to_topic_username":"شما نام کاربری شخصی را وارد کرده‌اید. ما این امر را به اطلاع او رسانده و او را به این عنوان دعوت می‌کنیم.","to_username":"نام کاربری شخصی که می‌خواهید او را دعوت کنید، وارد کنید. ما این امر را به اطلاع او رسانده و او را به این عنوان دعوت می‌کنیم.","email_placeholder":"name@example.com","success_email":"lما از طریق ایمیل دعوت نامه ارسال کردیم \u003cB\u003e {{emailOrUsername}} \u003c/ B\u003e. هنگامی که به دعوت شما پاسخ داده شد ما به شما اطلاع خواهیم داد.برای پی گیری به تب دعوت ها در پنل کاربری مراجعه نمایید","success_username":"ما آن کاربر را برای شرکت در این جستار دعوت کردیم.","error":"متاسفیم٬‌ ما آن شخص را نمی توانیم دعوت کنیم. شاید قبلا دعوت شده اند. (فراخوان ها تعداد محدودی دارند)"},"login_reply":"برای پاسخ وارد شوید","filters":{"n_posts":{"other":"{{count}} نوشته ها"},"cancel":"حذف فیلتر"},"split_topic":{"title":"انتقال به موضوع جدید","action":"انتقال به موضوع جدید","topic_name":"نام موضوع تازه","error":"اینجا یک ایراد بود برای جابجایی نوشته ها به موضوع جدید.","instructions":{"other":"شما نزدیک به ساخت یک موضوع جدید و افزون کردن ان با \u003cb\u003e{{count}}\u003c/b\u003e با نوشته های که انتخاب کرده ای. "}},"merge_topic":{"title":"انتقال به موضوع موجود","action":"انتقال به موضوع موجود","error":"اینجا یک ایراد برای جابجایی نوشته ها به  آن موضوع بود.","instructions":{"other":"لطفاً موضوعی را که قصد دارید تا  \u003cb\u003e{{count}}\u003c/b\u003eاز نوشته‌ها را به آن انتقال دهید، انتخاب نمایید."}},"change_owner":{"title":"تغییر مالکیت نوشته ها","action":"تغییر مالکیت","error":"آنجا یک ایراد برای تغییر مالکیت آن پست وجود داشت. ","label":"مالک جدید نوشته ها ","placeholder":"نام کاربری مالک جدید","instructions":{"other":"لطفا مالک جدید را برای این {{count}}  نوشته انتخاب کنید با  \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"نکته٬ هر گونه آگاه سازی برای این پست  همانند سابق برای کاربر جدید فرستاده نمی شود. .\u003cbr\u003e اخطار: در حال حاضر٬‌ هیچگونه اطلاعات قبلی به کاربر جدید فرستاده نشده. با احتیاط استفاده شود. "},"multi_select":{"select":"انتخاب","selected":"انتخاب شده ({{count}}) ","select_replies":"انتخاب کردن + جواب دادن","delete":"حذف انتخاب شده ها","cancel":"لغو انتخاب","select_all":"انتخاب همه","deselect_all":"عدم انتخاب همه","description":{"other":"شما تعداد \u003cb\u003e{{count}}\u003c/b\u003e نوشته انتخاب کرده اید"}}},"post":{"quote_reply":"پاسخ با نقل قول","edit":"در حال ویرایش {{link}} {{replyAvatar}} {{username}}","edit_reason":"دلیل:","post_number":"نوشته {{number}}","last_edited_on":"آخرین ویرایش نوشته در","reply_as_new_topic":"پاسخگویی به عنوان یک موضوع لینک شده","continue_discussion":"دنبالهٔ موضوع {{postLink}}:","follow_quote":"برو به نوشته ای که نقل‌قول شده","show_full":"نمایش کامل نوشته","show_hidden":"نمایش درون‌مایهٔ پنهان","deleted_by_author":{"other":"(نوشته های ارسال شده توسط نویسنده،بصورت خودکار در %{count} ساعت حذف می شود مگر اینکه پرچم شود)"},"expand_collapse":"باز کردن/گستردن","gap":{"other":"{{count}} پاسخ پنهان را مشاهده کنید"},"more_links":"{{count}} مورد دیگر...","unread":"نوشته خوانده نشده است","has_replies":{"other":"{{count}} پاسخ"},"has_likes":{"other":"{{count}} لایک"},"has_likes_title":{"other":"{{count}} کاربر این مورد را پسندیده اند"},"errors":{"create":"متأسفیم، در فرستادن نوشته شما خطایی روی داد. لطفاً دوباره تلاش کنید.","edit":"متأسفیم، در ویرایش نوشته شما خطایی روی داد. لطفاً دوباره تلاش کنید.","upload":"متأسفیم، در بارگذاری آن پرونده خطایی روی داد. لطفاً دوباره تلاش کنید.","attachment_too_large":"با عرض پوزش٬ فایلی را که تلاش برای ارسال آن دارید بسیار بزرگ است (حداکثر سایز {{max_size_kb}}kb است)","file_too_large":"با عرض پوزش٬ فایلی را که تلاش برای ارسال آن دارید بسیار بزرگ است (حداکثر سایز {{max_size_kb}}kb است)","too_many_uploads":"متأسفیم، هر بار تنها می‌توانید یک پرونده را بار بگذارید.","too_many_dragged_and_dropped_files":"با عرض پوزش، شما همزمان فقط می توانید 10 فایل را گرفته و رها کنید.","upload_not_authorized":"متأسفیم، پرونده‌ای که تلاش دارید آن را بار بگذارید، پروانه‌دار نیست (پسوندهای پروانه‌دار: {{authorized_extensions})","image_upload_not_allowed_for_new_user":"با عرض پوزش، کاربران جدید نمی توانند تصویر بار گذاری نماییند.","attachment_upload_not_allowed_for_new_user":"با عرض پوزش، کاربران جدید نمی توانند فایل پیوست بار گذاری نماییند.","attachment_download_requires_login":"با عرض پوزش، شما برای دانلود فایل پیوست باید وارد سایت شوید."},"abandon":{"confirm":"آیا شما مطمئن هستید که میخواهید نوشته خود را رها کنید؟","no_value":"خیر، نگه دار","yes_value":"بله، رها کن"},"via_email":"این نوشته از طریق ایمیل ارسال شده است","wiki":{"about":"این یک نوشته ویکی است;کاربران عادی می توانند آن را ویرایش نماییند"},"archetypes":{"save":" ذخیره تنظیمات"},"controls":{"reply":"آغاز ساخت یک پاسخ به این نوشته","like":"شبیه این نوشته","has_liked":"شما این نوشته را لایک کرده اید","undo_like":"برگنداندن لایک","edit":"ویرایش این نوشته","edit_anonymous":"با عرض پوزش، اما شما برای ویرایش این نوشته باید وارد سیستم شوید.","flag":"پرچم خصوصی این نوشته برا رسیدگی یا ارسال پیام خصوصی در باره آن","delete":"حذف این نوشته","undelete":"بازگردانی این نوشته","share":"اشتراک گذاری یک لینک در این نوشته","more":"بیشتر","delete_replies":{"confirm":{"other":"آیا شما می خواهید تعداد {{count}} پاسخ را از این نوشته حذف کنید ؟"},"yes_value":"بله، پاسخ ها را حذف کن","no_value":"نه، تنها این نوشته"},"admin":"عملیات مدیریت نوشته","wiki":"ساخت ویکی","unwiki":"حذف ویکی","convert_to_moderator":"اضافه کردن رنگ مدیر","revert_to_regular":"حذف زنگ مدیر","rebake":"باز سازی اچ تی ام ال","unhide":"آشکار کردن"},"actions":{"flag":"پرچم","defer_flags":{"other":"پرچم تسلیم"},"it_too":{"off_topic":"هم‌چنین آن یکی را پرچم بزنید","spam":"هم‌چنین آن یکی را پرچم بزنید","inappropriate":"هم‌چنین آن یکی را پرچم بزنید","custom_flag":"هم‌چنین آن یکی را پرچم بزنید","bookmark":"هم‌چنین نشانک‌گذاری آن یکی","like":"همچنین آن یکی را پسند کنید","vote":"هم‌چنین به آن یکی رأی دهید"},"undo":{"off_topic":"برداشتن پرچم","spam":"برداشتن پرچم","inappropriate":"برگرداندن پرچم","bookmark":"برداشتن نشانک","like":"خنثی سازی لایک","vote":"خنثی سازی امتیاز"},"people":{"off_topic":"{{icons}} برای این مورد پرچم آف-‌تاپیک زد","spam":"{{icons}} برای این مورد پرچم هرزنامه زد","spam_with_url":"{{icons}} پرچم گذاری شد\u003ca href='{{postUrl}}'\u003eاین یک هرزنامه است\u003c/a\u003e","inappropriate":"{{icons}} با پرچم گزاری این مورد را نامناسب بدان","notify_moderators":"{{icons}} مدیران را آگاه کرد","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eمدیران را آگاه کرد\u003c/a\u003e","notify_user":"{{icons}} ارسال یک پیام خصوصی","notify_user_with_url":"{{icons}} ارسال \u003ca href='{{postUrl}}'\u003eپیام خصوصی\u003c/a\u003e","bookmark":"{{icons}} این را نشانه‌گذاری کرد","like":"{{icons}} این مورد را پسندید","vote":"{{icons}}  رأی داد به این "},"by_you":{"off_topic":"شما برای این مورد پرچم آف-تاپیک زدید","spam":"شما برای این مورد پرچم هرزنامه زدید","inappropriate":"شما این مورد را نامناسب گزارش کردید.","notify_moderators":"شما این مورد را برای بررسی پرچم زدید","notify_user":"شما یک پیام به این کاربر ارسال کردید","bookmark":"شما  روی این نوشته نشانک گذاشتید","like":"شما این نوشته را پسند کردید","vote":"شما به این نوشته رأی دادید"},"by_you_and_others":{"off_topic":{"other":"شما و {{count}} کاربر دیگر این مورد را آف-تاپیک گزارش کردید"},"spam":{"other":"شما و {{count}} کاربر دیگر این مورد را هرزنامه گزارش کردید"},"inappropriate":{"other":"شما و {{count}} کاربر دیگر این مورد را نامناسب گزارش کردید"},"notify_moderators":{"other":"شما و {{count}} کاربر دیگر این مورد را برای بررسی گزارش کردید"},"notify_user":{"other":"شما و {{count}} افراد دیگر به این کاربر پیام فرستاده اید"},"bookmark":{"other":"شما و {{count}} کاربر دیگر روی این نوشته نشانک گذاشتید"},"like":{"other":"شما و {{count}} کاربر دیگر این مورد را پسند کردید"},"vote":{"other":"شما و {{count}} کاربر دیگر به این نوشته رأی دادید"}},"by_others":{"off_topic":{"other":"{{count}} کاربر ین مورد را آف-تاپیک گزارش کردند"},"spam":{"other":"{{count}} کاربر ین مورد را هرزنامه گزارش کردند"},"inappropriate":{"other":"{{count}} کاربر این مورد را نامناسب گزارش کردند"},"notify_moderators":{"other":"{{count}} کاربر این مورد را برای بررسی گزارش کردند"},"notify_user":{"other":"{{count}} ارسال پیام به این کاربر"},"bookmark":{"other":"{{count}} کاربر روی این نوشته نشانک گذاشتند"},"like":{"other":"{{count}} کاربر این مورد را پسند کردند"},"vote":{"other":"{{count}} کاربران به این نوشته رأی دادند"}}},"delete":{"confirm":{"other":"آیا مطمئنید که می‌خواهید همهٔ آن نوشته ها را پاک کنید؟"}},"revisions":{"controls":{"first":"بازبینی نخست","previous":"بازبینی پیشین","next":"بازبینی پسین","last":"بازبینی نهایی","hide":"مخفی کردن نسخه","show":"نمایش نسخه","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"نمایش خروجی رندر با اضافات و از بین بردن درون خطی","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"نمایش تفاوت های خروجی رندر شده سو به سو","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"نمایش تفاوت های خروجی منبع اولیه سو به سو","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Raw"}}}},"category":{"can":"can\u0026hellip; ","none":"(بدون دسته)","all":"همهٔ دسته‌بندی ها","choose":"انتخاب یک دسته بندی\u0026hellip;","edit":"ویرایش","edit_long":"ویرایش","view":"نمایش موضوعات  در دسته","general":"عمومی","settings":"تنظیمات","topic_template":"قالب موضوع","delete":"پاک کردن دسته","create":"دسته بندی جدید","save":"ذخیره سازی دسته بندی","slug":"Slug دسته بندی","slug_placeholder":"(اختیاری) dash-کلمه برای url","creation_error":"خطایی در ساخت این دسته بروز کرد.","save_error":"خطایی در ذخیره سازی این دسته بندی روی داد.","name":"نام دسته","description":"توضیحات","topic":"دسته بندی موضوع","logo":"تصویر لوگو برای دسته بندی","background_image":"تصویر پس زمینه برای دسته بندی","badge_colors":"رنگ مدال ها","background_color":"رنگ پس زمینه","foreground_color":"رنگ پیش زمینه","name_placeholder":"حداکثر یک با دوکلمه","color_placeholder":"هر رنگ وب","delete_confirm":"آیا مطمئنید که می‌خواهید این دسته‌بندی را پاک کنید؟","delete_error":"هنگام حذف دسته بندی خطایی رخ داد.","list":"فهرست دسته‌ بندی ها","no_description":"لطفا برای این دسته بندی توضیحاتی اضافه نمایید.","change_in_category_topic":"ویرایش توضیحات","already_used":"این رنگ توسط یک دسته بندی دیگر گزیده شده است","security":"امنیت","images":"تصاویر","auto_close_label":"بسته شدن خودکار موضوعات پس از:","auto_close_units":"ساعت ها","email_in":"آدرس ایمیل های دریافتی سفارشی:","email_in_allow_strangers":"تایید ایمیل ها از کاربران ناشناس  بدون حساب کاربری","email_in_disabled":"ارسال پست با ایمیل در تنظیمات سایت غیر فعال است. برای فعال سازی  موضوعات جدید را با ایمیل ارسال کنید, ","email_in_disabled_click":"فعال کردن تنظیمات \"email in\".","allow_badges_label":"امکان  اهداء مدال در این دسته بندی را بده","edit_permissions":"ویرایش پروانه‌ها","add_permission":"افزودن پروانه","this_year":"امسال","position":"موقعیت","default_position":"موقعیت پیش فرض","position_disabled":"دسته‌ها به‌ترتیب فعالیت نمایش داده می‌شوند. برای مهار ترتیب دسته‌ها در فهرست‌ها، تنظیمات «موقعیت‌های دستهٔ ثابت» را به کار اندازید.","position_disabled_click":"در تنظیمات \"مکان دسته بندی ثابت\"  فعال را کنید.","parent":"دسته مادر","notifications":{"watching":{"title":"در حال تماشا"},"tracking":{"title":"پیگیری"},"regular":{"description":"در صورتی که فردی با @name به شما اشاره کند یا به شما پاسخی دهد به شما اطلاع داده خواهد شد."},"muted":{"title":"بی صدا شد"}}},"flagging":{"title":"تشکر برای کمک به نگه داشتن جامعه ما  بصورت مدنی !","private_reminder":"پرچم های خصوصی, \u003cb\u003eفقط\u003c/b\u003e قابل مشاهده برای مدیران","action":"پرچم‌گذاری نوشته","take_action":"اقدام","notify_action":"پیام","delete_spammer":"پاک کردن هرزنگار","delete_confirm":"شما در مورد حذف \u003cb\u003e%{posts}\u003c/b\u003e نوشته ها و  \u003cb\u003e%{topics}\u003c/b\u003e موضوغات این کاربر،و حذف حساب کاربری وی، مسدود شدن ثبت نام از این آدرس آی پی\u003cb\u003e%{ip_address}\u003c/b\u003e و اضافه شدن ایمیل \u003cb\u003e%{email}\u003c/b\u003e به لیست مسدودیت دائمی.\nآیا اطمینان دارید که این کاربر یک اسپمر است ؟","yes_delete_spammer":"بله، پاک‌کردن هرزنگار","ip_address_missing":"(N/A)","hidden_email_address":"(مخفی)","submit_tooltip":"ایجاد پرچم خصوصی","take_action_tooltip":"رسیدن سریع به آستانه پرچم، بلافاصله به جای انتظار برای پرچم انجمن","cant":"متأسفیم، در این زمان نمی‌توانید  روی این نوشته پرچم بگذارید.","formatted_name":{"off_topic":"آن موضوع قدیمی است","inappropriate":"این نامناسب است","spam":"آن هرزنامه است"},"custom_placeholder_notify_user":"خاص، سودمند باشید و همیشه مهربان.","custom_placeholder_notify_moderators":"به ما اجازه دهید بدانیم  شما در مورد چه چیز آن نگران هستید، و ارائه لینک مربوطه و نمونه آن امکان پذیر است.","custom_message":{"at_least":"دست‌کم {{n}} نویسه بنویسید","more":"{{n}} نویسهٔ دیگر تا...","left":"{{n}} مانده"}},"flagging_topic":{"title":"تشکر برای کمک به جامعه مدنی انجمن ما!","action":"پرچم‌گذاری موضوع","notify_action":"پیام"},"topic_map":{"title":"چکیدهٔ موضوع","participants_title":"نویسنده‌های فعال","links_title":"لینک‌های محبوب","links_shown":"نمایش همه {{totalLinks}} پیوند ها...","clicks":{"other":"%{count} کلیک ها"}},"topic_statuses":{"warning":{"help":"این یک هشدار رسمی است."},"bookmarked":{"help":"شما بر روی این موضوع نشانک گذاشته‌اید."},"locked":{"help":"این موضوع بسته شده؛ پاسخ‌های تازه اینجا پذیرفته نمی‌شوند"},"archived":{"help":"این موضوع بایگانی شده؛ یخ زده و نمی‌تواند تغییر کند."},"unpinned":{"title":"خارج کردن از سنجاق","help":"این موضوع برای شما شنجاق نشده است، آن طور منظم نمایش داده خواهد شد"},"pinned_globally":{"title":"به صورت سراسری سنجاق شد"},"pinned":{"title":"سنجاق شد","help":"این موضوع برای شما سنجاق شده است، آن طور منظم در بالای دسته بندی نمایش داده خواهد شد."},"invisible":{"help":"این موضوع از لیست خارج شد: آن درلیست موضوعات نمایش داده نخواهد شد، و فقط از طریق لینک مستقیم در دسترس خواهد بود. "}},"posts":"نوشته‌ها","posts_lowercase":"نوشته ها","posts_long":"این موضوع {{number}} نوشته دارد","original_post":"نوشته اصلی","views":"نمایش‌ها","views_lowercase":{"other":"بازدیدها"},"replies":"پاسخ‌ها","views_long":"از این موضوع {{number}} بار بازدید شده","activity":"فعالیت","likes":"پسندها","likes_lowercase":{"other":"پسند ها"},"likes_long":"{{number}} پسند در این موضوع وجود دارد","users":"کاربران","users_lowercase":{"other":"کاربران"},"category_title":"دسته","history":"تاریخچه","changed_by":"توسط {{author}}","raw_email":{"title":"ایمیل خام","not_available":"در دسترس نیست!"},"categories_list":"فهرست دسته‌ بندی ها","filters":{"with_topics":"%{filter} موضوعات","with_category":"%{filter} %{category} موضوعات","latest":{"help":"موضوعات با نوشته های تازه"},"hot":{"title":"داغ","help":"گزینشی از داغترین موضوعات"},"read":{"title":"خواندن","help":"موضوعاتی که شما خواندید٬ بر اساس آخرین خوانده شده ها. "},"search":{"title":"جستجو","help":"جستجوی تمام موضوعات"},"categories":{"title":"دسته‌ بندی ها","title_in":"دسته بندی - {{categoryName}}","help":"همهٔ موضوعات در دسته‌ بندی ها جای گرفتند"},"unread":{"help":"موضوعاتی که در حال حاضر مشاهده می کنید یا دنبال می کنید با نوشته های خوانده نشده"},"new":{"lower_title":"جدید","help":"موضوعات  ایجاد شده در چند روز گذشته"},"posted":{"title":"نوشته‌های من","help":"در این موضوع شما نوشته داردید"},"bookmarks":{"title":"نشانک ها","help":"موضوعاتی که نشانک‌گذاری کرده‌اید."},"category":{"help":"موضوعات تازه در دستهٔ {{categoryName}}"},"top":{"title":"بالاترین‌ ها","help":"بیشترین موضوعات فعال در سال گذشته، ماه  ، هفته یا روز","all":{"title":"تمام وقت"},"yearly":{"title":"سالیانه "},"monthly":{"title":"ماهیانه "},"weekly":{"title":"هفتگی"},"daily":{"title":"روزانه"},"all_time":"تمام وقت","this_year":"سال","this_month":"ماه","this_week":"هفته","today":"امروز","other_periods":"دیدن بالاترین مطالب"}},"browser_update":"متاسفانه,\u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eمرورگر شما خیلی قدیمی است برای ادامه کار در این وب سایت\u003c/a\u003e. لطفا \u003ca href=\"http://browsehappy.com\"\u003eمرورگر خود را بروز رسانی نمایید\u003c/a\u003e.","permission_types":{"full":"ساختن / پاسخ دادن / دیدن","create_post":"پاسخ دادن / دیدن","readonly":"دیدن"},"docker":{"upgrade":"نسخه نصب شده شما به روز نیست.","perform_upgrade":"برای ارتقاء اینجا کلیک کنید."},"poll":{"voters":{"other":"رأی دهندگان"},"total_votes":{"other":"مجموع آرا"},"average_rating":"میانگین امتیاز:  \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"between_min_and_max_options":"می‌توانید بین \u003cstrong\u003e%{min}\u003c/strong\u003e تا \u003cstrong\u003e%{max}\u003c/strong\u003e گزینه را انتخاب کنید."}},"cast-votes":{"title":"انداختن رأی شما","label":"رای بدهید!"},"show-results":{"title":"نتایج نظرسنجی را نمایش بده","label":"نتایج را نشان بده"},"hide-results":{"title":"برگشتن به رای گیری ","label":"نتایج را مخفی کن "},"open":{"title":"نظرسنجی را باز کن ","label":"باز","confirm":"آیا از باز کردن این نظرسنجی اطمینان دارید ؟ "},"close":{"title":"نظرسنجی را ببند","label":"بسته ","confirm":"آیا از بستن این نظرسنجی اطمینان دارید ؟ "},"error_while_toggling_status":"خطایی رخ داد در حالی که وضعیت این نظرسنجی روشن نیست.","error_while_casting_votes":"خطایی رخ داد در حالی که شما رای می دادید."},"type_to_filter":"بنویسید تا فیلتر کنید...","admin":{"title":"ادمین دیسکورس","moderator":"مدیران","dashboard":{"title":"پیشخوان","last_updated":"آخرین به‌ روزرسانی پیش‌خوان","version":"نسخه","up_to_date":"شما به روز هستید!","critical_available":"به روز رسانی مهم در دسترس است.","updates_available":"بروز رسانی در درسترس است.","please_upgrade":"لطفا ارتقاء دهید!","no_check_performed":"بررسی برای بروزرسانی انجام نشد. از اجرای sidekiq اطمینان حاصل کنید.","stale_data":"بررسی برای بروزرسانی اخیراً انجام نگرفته است. از اجرای  sidekiq اطمینان حاصل کنید.","version_check_pending":"گویا به‌تازگی به‌روز کرده‌اید. عالیه!","installed_version":"نصب","latest_version":"آخرین","problems_found":"ما در نصب Discourse شما چند مشکل پیدا کرده ایم.","last_checked":" آخرین چک شده","refresh_problems":"تازه کردن","no_problems":"هیچ مشکلات پیدا نشد.","moderators":"مدیران:","admins":"مدیران کل:","blocked":"مسدود شده ها:","suspended":"تعلیق شده:","private_messages_short":"پیام","private_messages_title":"پیام","mobile_title":"موبایل","space_free":"{{size}} آزاد","uploads":"بارگذاری ها","backups":"پشتیبان ها","traffic_short":"ترافیک","traffic":"درخواست های نرم افزار وب","page_views":"درخواست های API","page_views_short":"درخواست های API","show_traffic_report":"نمایش دقیق گزارش ترافیک","reports":{"today":"امروز","yesterday":"دیروز","last_7_days":"7 روز اخیر","last_30_days":"آخرین 30 روز","all_time":"همه زمان ها","7_days_ago":"7 روز پیش","30_days_ago":"30 روز پیش","all":"همه","view_table":"جدول","view_chart":"نمودار میله ها","refresh_report":"تازه کردن گزارش","start_date":"تاریخ شروع","end_date":"تاریخ پایان"}},"commits":{"latest_changes":"آخرین تغییرات: لطفا دوباره به روز رسانی کنید!","by":"توسط"},"flags":{"title":"پرچم ها","old":"قدیمی","active":"فعال","agree":"موافقت کردن","agree_title":"تایید این پرچم به عنوان معتبر و صحیح","agree_flag_modal_title":"موافقت کردن و...","agree_flag_hide_post":"موافقت با (مخفی کردن نوشته + ارسال پیام خصوصی)","agree_flag_hide_post_title":"این نوشته را مخفی کن و به کاربر به صورت خودکار پیام ارسال کن تا این نوشته را ویرایش کند","agree_flag_restore_post":"موافقم (بازگرداندن نوشته)","agree_flag_restore_post_title":"بازگرداندن این نوشته","agree_flag":"موافقت با پرچم گذاری","agree_flag_title":"موافقت با پرچم و نگه داشتن نوشته بدون تغییر","defer_flag":" واگذار کردن","defer_flag_title":"حذف این پرچم; بدون نیاز به اقدام در این زمان","delete":"حذف","delete_title":"حذف پرچم نوشته و اشاره به.","delete_post_defer_flag":"حذف نوشته و رها کردن پرچم","delete_post_defer_flag_title":"حذف نوشته; اگر اولین نوشته است، موضوع را حذف نمایید.","delete_post_agree_flag":"حذف نوشته و موافقت با پرچم","delete_post_agree_flag_title":"حذف نوشته; اگر اولین نوشته است، موضوع را حذف نمایید.","delete_flag_modal_title":"حذف و...","delete_spammer":"حذف اسپمر","delete_spammer_title":"حذف کاربر و تمام نوشته ها و موضوعات این کاربر","disagree_flag_unhide_post":"مخالفم (با رویت نوشته)","disagree_flag_unhide_post_title":"حذف تمام پرچم های این نوشته و دوباره نوشته را قابل نمایش کن ","disagree_flag":"مخالف","disagree_flag_title":"انکار این پرچم به عنوان نامعتبر است و یا نادرست","clear_topic_flags":"تأیید","clear_topic_flags_title":"موضوع بررسی و موضوع حل شده است. تأیید را بفشارید تا پرچم‌ها برداشته شوند.","more":"(پاسخ های بیشتر...)","dispositions":{"agreed":"موافقت شد","disagreed":"مخالفت شد","deferred":"دیرفرست"},"flagged_by":"پرچم شده توسط","resolved_by":"حل شده توسط","took_action":"زمان عمل","system":"سیستم","error":"اشتباهی روی داد","reply_message":"پاسخ دادن","no_results":"هیچ پرچمی نیست","topic_flagged":"این \u003cstrong\u003eموضوع\u003c/strong\u003e پرچم خورده است.","visit_topic":" موضوع را ببینید برای اقدام لازم","was_edited":"نوشته پس از پرچم اول ویرایش شد","previous_flags_count":"این موضوع در حال حاضر با {{count}} پرچم گذاری شده است.","summary":{"action_type_3":{"other":"موضوعات غیرفعال x{{count}}"},"action_type_4":{"other":"نامناسب X{{count}}"},"action_type_6":{"other":"دلخواه x{{count}}"},"action_type_7":{"other":"دلخواه x{{count}}"},"action_type_8":{"other":" هرزنامه x{{count}}"}}},"groups":{"primary":"گروه اولیه","no_primary":"(بدون گروه اولیه)","title":"گروه‌ها","edit":"ویرایش گروه‌ها","refresh":"تازه کردن","new":"جدید","selector_placeholder":"نام کاربری را وارد نمایید .","name_placeholder":"نام گروه، بدون فاصله، همان قاعده نام کاربری","about":"اعضای گروهت و نام ها  را اینجا ویرایش کن","group_members":"اعضای گروه","delete":"حذف","delete_confirm":"حفظ کردن این گروه؟","delete_failed":"قادر به حذف گروه نیستیم. اگر این یک گروه خودکار است، نمی توان آن را از بین برد.","delete_member_confirm":"حذف کردن '%{username}' از '%{group}' گروه؟","name":"نام","add":"اضافه کردن","add_members":"اضافه کردن عضو","custom":"دلخواه","automatic":"خودکار","automatic_membership_email_domains":" کاربرانی که با ایمیل  دامنه ثبت نام کرده اند،دقیقا شبیه دامنه های لیست، بصورت خودکار به این گروه اضافه می شوند :","automatic_membership_retroactive":"درخواست همان قاعده دامنه ایمیل برای اضافه کردن برای کاربران ثبت نام کرده","default_title":"عنوان را پیش فرض کن برای تمام اعضا در این گروه","primary_group":"بطور خودکار به گروه اصلی تبدیل شد"},"api":{"generate_master":"ایجاد کلید اصلی API","none":"هم اکنون هیچ کلید API فعالی وجود ندارد","user":"کاربر","title":"API","key":"کلید API","generate":"تولید کردن","regenerate":"ایجاد مجدد","revoke":"لغو کردن","confirm_regen":"آیا می خواهید API موجود را با یک API جدید جایگزین کنید؟","confirm_revoke":"آیا مطمئن هستید که می خواهید کلید را برگردانید؟","info_html":"موضوعات تازه پس از آخرین بازدید شما","all_users":"همه کاربران","note_html":"این کلید را \u003cstrong\u003eامن\u003c/strong\u003e نگهدارید، تمام  کاربرانی که آن را دارند می توانند نوشته های دلخواه بسازند به عنوان هر کاربری"},"plugins":{"title":"افزونه ها","installed":"افزونه های نصب شده","name":"نام","none_installed":"شما هیچ افزونه نصب شده ای  ندارید","version":"نسخه","enabled":"فعال شده؟","is_enabled":"Y","not_enabled":"N","change_settings":"تغییر تنظیمات","change_settings_short":"تنظیمات","howto":"چگونه یک افزونه نصب کنیم؟"},"backups":{"title":"پشتیبان گیری","menu":{"backups":"پشتیبان ها","logs":"گزارش ها"},"none":"هیچ پشتیبانی در دسترس نیست.","read_only":{"enable":{"title":"به کار گرفتن شیوهٔ‌ فقط-خواندنی","label":"غیر فعال کردن مد فقط خواندن","confirm":"آیا مطمئنید که می‌خواهید حالت فقط-خواندنی را فعال کنید ؟"},"disable":{"title":" حالت فقط-خواندنی را غیر فعال کن","label":"غیر فعال کردن مد فقط خواندن"}},"logs":{"none":"هنوز بدون گزارش است ..."},"columns":{"filename":"نام پرونده","size":"اندازه"},"upload":{"label":"بار گذاری","title":"آپلود یک نسخه پشتیبان برای نمونه","uploading":"در حال بار گذاری ...","success":"'{{filename}}' با موفقیت آپلود شد.","error":"هنگام آپلود خطایی رخ می دهد '{{filename}}': {{message}}"},"operations":{"is_running":"عملیاتی در جریان است...","failed":"{{operation}} ناموفق شد. لطفا گزارشات را بررسی نمایید.","cancel":{"label":"لغو کردن","title":"کنار گذاشتن عملیات کنونی","confirm":"آیا مطمئنید که می‌خواهید عملیات کنونی را کنار بگذارید؟"},"backup":{"label":"پشتیبان گیری","title":"ساخت یک پشتیبان","confirm":"آیا می خواهید یک پشیبان گیری جدید را آغاز نمایید ؟","without_uploads":"بله (فایل ها را شامل نمی شود)"},"download":{"label":"دانلود","title":"دانلود پشتیبان"},"destroy":{"title":"پاک کردن پشتیبان","confirm":"آیا مطمئنید که می‌خواهید پشتیبان را از بین ببرید؟"},"restore":{"is_disabled":"بازگردانی در تنظیمات سایت از کار انداخته شده است.","label":"بازیابی","title":"بازیابی  پشتیبان","confirm":"آیا مطمئنید که می‌خواهید پشتیبان را برگردانید؟"},"rollback":{"label":"عقبگرد","title":"عقب گرد پایگاه داده به حالت کار قبلی","confirm":"آیا مطمئن هستید به بازگشت به حالت کار قبلی پایگاه داده ؟"}}},"export_csv":{"user_archive_confirm":"آیا مطمئنید که می‌خواهید نوشته‌هایتان را دانلود کنید؟","success":"فرایند برون ریزی، به شما از طریق پیام اطلاع رسانی خواهد شد وقتی این فرایند تکمیل شود.","failed":"برون ریزی شکست خورد.  لطفا لوگ گزارشات را مشاهده فرمایید.","rate_limit_error":"نوشته ها را می توانید روزی فقط یک بار دانلود کنید. لطفا فردا دوباره امتحان کنید.","button_text":"خروجی گرفتن","button_title":{"user":"برون ریزی لیست کاربر در قالب CSV .","staff_action":"برون ریزی تمام فعالیت  مدیران با فرمت CSV .","screened_email":"برون ریزی کامل لیست ایمیل به نمایش در آمده در فرمت CSV.","screened_ip":"برون ریزی کامل لیست IP به نمایش در آمده در فرمت CSV.","screened_url":"برون ریزی کامل لیست URL به نمایش در آمده در فرمت CSV."}},"export_json":{"button_text":"خروجی گرفتن"},"invite":{"button_text":"ارسال دعوتنامه","button_title":"ارسال دعوتنامه"},"customize":{"title":"شخصی‌سازی","long_title":"شخصی‌سازی سایت","css":"CSS","header":"سردر","top":"بالا","footer":"پانوشته ","head_tag":{"text":"\u003c/head\u003e","title":"HTML هایی که  قرار داده شده  قبل از تگ \u003c/head\u003e "},"body_tag":{"text":"\u003c/body\u003e","title":"HTML هایی که  قرار داده شده  قبل از تگ \u003c/body\u003e "},"override_default":"شامل شیوه نامه استاندارد نکن","enabled":"فعال شد؟","preview":"پیش‌نمایش","undo_preview":"حذف پیش نمایش","rescue_preview":"به سبک پیش فرض","explain_preview":"مشاهده‌ی سایت با این قالب سفارشی","explain_undo_preview":"بازگشت به شیوه نامه های  فعال شخصی","explain_rescue_preview":"دیدن سایت با شیوه نامه پیش فرض","save":"ذخیره سازی","new":"تازه","new_style":"سبک جدید","import":"ورود داده‌ها","import_title":"فایلی را انتخاب یا متنی را پیست کنید","delete":"پاک کردن","delete_confirm":"پاک کردن این شخصی‌سازی؟","about":"اطلاح شیوه نامه CSS و هدر HTML در سایت، اضافه کردنیک سفارشی سازی برای شروع.","color":"رنگ","opacity":"تاری","copy":"کپی","css_html":{"title":"CSS/HTML","long_title":"شخصی‌سازی CSS و HTML"},"colors":{"title":"رنگ‌ها","long_title":"طرح‌های رنگی","about":"تغییر رنگ استفاده شده در انجمن بدون نوشتن کد CSS.با اضافه کردن یک طرح شروع کنید.","new_name":"طرح رنگ جدید","copy_name_prefix":"نمونه سازی از","delete_confirm":"این طرح رنگ پاک شود؟","undo":"خنثی کردن","undo_title":"برگشت دادن رنگ دخیره شده خود به آخرین رنگی که ذخیره شده است","revert":"برگشت","revert_title":"تنظیم مجدد این رنگ به رنگ به پیش فرض دیسکورس.","primary":{"name":"اولی","description":"متن بیشتر، آیکون ها، و کناره ها."},"secondary":{"name":"دومی","description":"رنگ پس زمینه اصلی، و رنگ متن برخی از دکمه ها."},"tertiary":{"name":"سومین","description":"لینک ها، برخی از دکمه ها، اطلاعیه ها، و مد رنگ."},"quaternary":{"name":"چهارمی","description":"لینک های ناوبری."},"header_background":{"name":"پس زمینه هدر","description":"رنگ پس زمینه هدر سایت"},"header_primary":{"name":"هدر اولیه","description":"نوشته و آیکن های هدر سایت"},"highlight":{"name":"برجسته کردن","description":"رنگ پس زمینه عناصر  را برجسته  کرده  بر روی صفحه، مانند نوشته ها و موضوعات."},"danger":{"name":"خطرناک","description":"رنگ اقدامات  را برجسته کردن  مانند حذف نوشته ها و موضوعات."},"success":{"name":"موفقیت","description":"استفاده شده برای  مشخص کردن اقدام موفقیت آمیز بود"},"love":{"name":"دوست داشتن","description":"رنگ دکمه های لایک"},"wiki":{"name":"ویکی","description":"رنگ پایه  استفاده شده برای پس زمینه نوشته ها ی ویکی ."}}},"email":{"title":"ایمیل ","settings":"تنظیمات","all":"همه","sending_test":"فرستادن ایمیل آزمایشی...","error":"\u003cb\u003eخطا\u003c/b\u003e - %{server_error}","test_error":"در ارسال ایمیل آزمایشی مشکلی وجود داشته است. لطفاً مجدداً تنظیمات ایمیل خود را بررسی کنید، از این که هاستتان اتصالات ایمیل را مسدود نکرده اطمینان حاصل کرده و مجدداً تلاش کنید.","sent":"فرستاده شده","skipped":"رد داده شده","sent_at":"ارسال شده در","time":"زمان","user":"کاربر","email_type":"نوع ایمیل","to_address":"به آدرس","test_email_address":"آدرس ایمیل برای آزمایش","send_test":"ارسال ایمیل آزمایشی","sent_test":"فرستاده شد!","delivery_method":"روش تحویل","preview_digest":"پیشنمایش خلاصه","refresh":"تازه‌سازی","format":"قالب","html":"html","text":"متن","last_seen_user":"آخرین مشاهده کاربر :","reply_key":"کلید پاسخ","skipped_reason":"رد دادن دلیل","logs":{"none":"هیچ آماری یافت نشد.","filters":{"title":"فیلتر","user_placeholder":"نام کاربری","address_placeholder":"name@example.com","type_placeholder":"خلاصه، ثبت نام ...","reply_key_placeholder":"کلید پاسخ","skipped_reason_placeholder":"دلیل"}}},"logs":{"title":"گزارش ها","action":"عمل","created_at":"ساخته شد","last_match_at":"آخرین مطابقت ","match_count":"مطابقت ها","ip_address":"IP","topic_id":" ID موضوع","post_id":"ID نوشته","delete":"حذف","edit":"ویرایش‌","save":"ذخیره ","screened_actions":{"block":"انسداد","do_nothing":"هیچ کاری نکن"},"staff_actions":{"title":"عملیات مدیران","instructions":"بر روی نام کاربر کلیک کنید تا عمل فیلتر لیست انجام شود. بر روی عکس نمایه کلیک کنید تا به صفحه کاربر هدایت شوید.","clear_filters":"همه چیز را نشان بده ","staff_user":"کاربران مدیر","target_user":"کاربران هدف","subject":"عنوان","when":"چه زمانی","context":"محتوا","details":"جزئیات","previous_value":"پیشین","new_value":"جدید","diff":"تفاوت","show":"نمایش","modal_title":"جزئیات","no_previous":"هیچ مقدار قبلی وجود ندارد.","deleted":"بدون مقدار جدید. رکورد حذف شد.","actions":{"delete_user":"حذف کاربر","change_trust_level":"تغییر دادن سطح اعتماد","change_username":"تغییر نام کاربری","change_site_setting":"تغییر تنظیمات سایت","change_site_customization":"تغییر سفارشی‌سازی سایت","delete_site_customization":"پاک‌کردن سفارشی‌سازی سایت","suspend_user":"کاربر تعلیق شده","unsuspend_user":"کابر تعلیق نشده","grant_badge":"اعطای مدال","revoke_badge":"لغو کردن مدال","check_email":"برسی ایمل","delete_topic":"حذف موضوع","delete_post":"حذف نوشته","impersonate":"جعل هویت کردن","anonymize_user":"کاربر ناشناس","roll_up":"آدرس‌های IP بلاک شده را جمع کنید"}},"screened_emails":{"title":"ایمیل ها نمایش داده شده","description":"وقتی کسی سعی می کند یک حساب جدید ایجاد کند، از آدرس ایمیل زیر بررسی و ثبت نام مسدود خواهد شد، و یا برخی از اقدام های دیگر انجام می شود.","email":"آدرس ایمیل","actions":{"allow":"اجازه"}},"screened_urls":{"title":"URL های نمایش داده شده","description":"URLs ذکر شده در اینجا در پست های کاربران مورد استفاده قرار گرفت ٬ که به عنوان اسپم شناسایی شده است","url":"URL","domain":"دامنه"},"screened_ips":{"title":"نمایش  IPs","description":"آدرس IP که مشاهده شده.  \"اجازه\" استفاده در لیست سفید.","delete_confirm":"آیا از حذف قانون وضع شده برای {ip_address}% اطمینان دارید؟","roll_up_confirm":"آیا مطمئن هستید که می خواهید IP مشاهده شده به زیر شبکه بازگشت داده شوند ؟","rolled_up_some_subnets":"با موفقیت IP مسدود شده بازگشت داده شد به ورودی های این زیر شبکه: %{subnets}.","rolled_up_no_subnet":"هیچ چیز برای ذخیره کردن وجود ندارد.","actions":{"block":"انسداد","do_nothing":"اجازه دادن","allow_admin":"به مدیر اجازه بده"},"form":{"label":"جدید:","ip_address":"نشانی IP","add":"افزودن","filter":"جستجو"},"roll_up":{"text":"جمع کردن","title":"ساخت مسدود سازی زیر شبکه جدید اگر آنها آخرین 'min_ban_entries_for_roll_up' ورودی ها بودند."}},"logster":{"title":"گزارش خطا"}},"impersonate":{"title":"جعل هویت کردن","help":"با استفاده ازابزار  جعل هویت کردن   یک حساب کاربری را برای اشکال زدایی انتخاب نمایید، شما باید بعد از اتمام کار یک بار خارج شوید.","not_found":"چنین کاربری یافت نمی‌شود.","invalid":"متأسفیم، شما نمی‌توانید خود را به جای این کاربر جا بزنید."},"users":{"title":"کاربران","create":"اضافه کردن کاربر ادمین","last_emailed":"آخرین ایمیل فرستاده شده","not_found":"متاسفیم٬ این کاربر در سیستم ما وجود ندارد.","id_not_found":"متاسفیم٬ این ID کاربری در سیستم ما وجود ندارد.","active":"فعال","show_emails":"ایمیل عا را نشان بده","nav":{"new":"جدید","active":"فعال","pending":"در انتظار","staff":"مدیران","suspended":"تعلیق شد ","blocked":"مسدود شده","suspect":"مشکوک"},"approved":"تایید شده ؟","approved_selected":{"other":"کاربران تایید شده  ({{count}})"},"reject_selected":{"other":"کاربران رد شده  ({{count}})"},"titles":{"active":"کاربران فعال","new":"کاربران تازه","pending":"کاربران در انتظار بررسی","newuser":"کاربران در سطح اعتماد 0 (کاربران جدید)","basic":"کاربران در سطح اعتماد 1 (کاربر اصلی)","staff":"مدیر","admins":"کاربران مدیر","moderators":"مدیران","blocked":"کاربران مسدود شده","suspended":"کاربران تعلیق شده","suspect":"کاربران مشکوک"},"reject_successful":{"other":"کاربران %{count}  با موفقیت رد شدند"},"reject_failures":{"other":"رد کاربران %{count} ناموفق بود"},"not_verified":"تایید نشده","check_email":{"title":"ایمیل این کاربران را قابل رویت کن.","text":"نشان دادن"}},"user":{"suspend_failed":"در جریان به تعلیق درآوردن این کاربر اشتباهی رخ داد. {{error}}","unsuspend_failed":"در جریان خارج کردن این کاربر از تعلیق، اشتباهی رخ داد {{error}}","suspend_duration":"کاربر چه مدت در تعلیق خواهد بود؟","suspend_duration_units":"(روز ها)","suspend_reason_label":"شما چرا معلق شده‌اید؟ این متن بر روی صفحه‌ی نمایه‌ی کاربر \u003cb/\u003eبرای همه قابل مشاهده خواهد بود\u003cb\u003e، و در هنگام ورود به سیستم نیز به خود کاربر نشان داده خواهد شد. لطفاً خلاصه بنویسید.","suspend_reason":"دلیل","suspended_by":"تعلیق شده توسط","delete_all_posts":"پاک کردن همهٔ نوشته‌ها","delete_all_posts_confirm":"شما می خواهید تعداد %{posts}  نوشته و تعداد %{topics} موضوع خذف کنید،آیا مطمئن هستید؟","suspend":"تعلیق","unsuspend":"خارج کردن از تعلیق","suspended":"تعلیق شد ؟","moderator":"مدیر ؟ ","admin":"مدیر؟","blocked":"مسدود شد ؟","show_admin_profile":"مدیر","edit_title":"ویرایش سرنویس","save_title":"ذخیره سازی سرنویس","refresh_browsers":"تازه کردن اجباری مرورگر","refresh_browsers_message":"ارسال پیام به تمام مشتریان! ","show_public_profile":"نمایش نمایه عمومی","impersonate":"جعل هویت کردن","ip_lookup":"IP Lookup","log_out":"خروج","logged_out":"کاربر از کل دستگاه ها خارج شد.","revoke_admin":"ابطال مدیریت","grant_admin":"اعطای مدیریت","revoke_moderation":"پس گرفتن مدیریت","grant_moderation":"اعطای مدیریت","unblock":"رفع انسداد","block":" انسداد","reputation":" اعتبار","permissions":"پروانه‌ها","activity":"فعالیت","like_count":"لایک‌های اعطایی/ دریافتی","last_100_days":"در 100 روز گذشته","private_topics_count":"موضوعات خصوصی","posts_read_count":"خواندن نوشته ها","post_count":"نوشته ها  ایجاد شد","topics_entered":" موضوعات بازدید شده","flags_given_count":"پرچم های داده شده","flags_received_count":"پرچم های دریافت شده","warnings_received_count":"اخطار های دریافت شده","flags_given_received_count":"پرچم های  داده شده/ دریافت شده","approve":"تصویب","approved_by":"تصویب شده توسط","approve_success":"کاربر تایید شده و ایمیل با دستورالعمل فعال سازی ارسال شد.","approve_bulk_success":"موفقیت! همه کاربران انتخاب شده تایید و اطلاعیه ارسال شد.","time_read":"خواندن زمان","anonymize":"کاربر ناشناس","anonymize_confirm":"آیا مطمئن هستید که می خواهید این حساب کاربری را ناشناس کنید؟ این ایمیل و نام کاربری را تغییر و تمام اطلاعات نمایه را بطور مجدد تنظیم می کند","anonymize_yes":"بله ، این یک حساب کاربری ناشناس است.","anonymize_failed":"یک مشکل با حساب کاربری ناشناس وجود دارد","delete":"پاک کردن کاربر","delete_forbidden_because_staff":"مدیران کل و مدیران را نمی‌توانید پاک کنید","delete_posts_forbidden_because_staff":"نمی توان همه نوشته های مدیران کل و مدیران را حذف کرد","delete_forbidden":{"other":"کاربرانی را که  دارای موضوع  هستند نمی‌توانید  پاک کنید. پیش از تلاش برای پاک کردن کاربر، نخست همهٔ‌ موضوعاتش را پاک کنید. (موضوعات که بیش از %{count}  روز پیش فرستاده شده باشند، نمی‌توانند پاک شوند.)"},"cant_delete_all_posts":{"other":"نمی توان همه نوشته ها را خذف کرد. برخی نوشته ها قدیمی تر از %{count} هستند.(در delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"other":"نمی توان همه نوشته ها را خذف کرد. چون تعداد کاربران از %{count} تعداد نوشته ها بیشتر است.(delete_all_posts_max)"},"delete_confirm":"آیا مطمئن هستید که می خواهید این کاربر را حذف کنید ؟ این برای همیشه است!","delete_and_block":"حذف و \u003cb\u003eمسدود\u003c/b\u003eکن این IP و آدرس ایمل را","delete_dont_block":"فقط حذف","deleted":"کاربر پاک شد.","delete_failed":"خطایی در پاک کردن آن کاربر روی داد. پیش از تلاش برای پاک کردن کاربر، مطمئن شوید همهٔ‌ موضوعات پاک شوند.","send_activation_email":"فرستادن ایمیل فعال‌سازی","activation_email_sent":"یک ایمیل فعال‌سازی فرستاده شده است.","send_activation_email_failed":"در فرستادن ایمیل  فعال‌سازی دیگری مشکل وجود دارد. \n%{error}","activate":"فعال‌سازی شناسه کاربری","activate_failed":"در فعال‌سازی این کاربر مشکلی پیش آمد.","deactivate_account":"غیرفعال‌کردن حساب کاربری","deactivate_failed":"برای غیرفعال کردن این کاربر مشکلی وجود دارد.","unblock_failed":" برداشتن رفع انسداد این کاربر مشکلی وجود دارد.","block_failed":"برای انسداد این کاربر مشکلی وجود دارد.","deactivate_explanation":"کاربر غیر فعال باید دوباره ایمیل خود را تایید کند.","suspended_explanation":"کاربر تعلیق شده نمی‌تواند وارد سیستم شود.","block_explanation":"کاربر انسداد شده نمی‌تواند نوشته ای بگذارد یا موضوعی آغاز کند.","trust_level_change_failed":"در تغییر سطح اعتماد کاربر مشکلی پیش آمد.","suspend_modal_title":"کاربر تعلیق شده","trust_level_2_users":"کاربران سطح اعتماد 2","trust_level_3_requirements":" سطح اعتماد 3 مورد نیاز است","trust_level_locked_tip":"سطح اعتماد بسته شده است. سیستم قادر به ترفیع/تنزل درجه‌ی کاربر نیست.","trust_level_unlocked_tip":"سطح اعتماد باز شده است. سیستم قادر به ترفیع/تنزل درجه‌ی کاربر خواهد بود.","lock_trust_level":"بستن سطح اعتماد","unlock_trust_level":"باز کردن سطح اعتماد","tl3_requirements":{"title":"شرایط لازم برای سطح اعتماد 3.","table_title":"در ۱۰۰ روز اخیر:","value_heading":"مقدار","requirement_heading":"نیازمندی‌ها","visits":"بازدیدها","days":"روز ها","topics_replied_to":"پاسخ به موضوعات","topics_viewed":"بازدید موضوعات","topics_viewed_all_time":"موضوعات مشاهده شده ( تمام مدت )","posts_read":"نوشته‌های خوانده شده","posts_read_all_time":"نوشته‌های خوانده شده ( تمام مدت )","flagged_posts":"نوشته‌های پرچم‌خورده","flagged_by_users":"کاربرانی که پرچم خورده‌اند","likes_given":"لایک‌های اعطایی","likes_received":"لایک‌های دریافتی","likes_received_days":"لایک‌های دریافتی: روزهای خاص","likes_received_users":"لایک‌های دریافتی: کاربران خاص","qualifies":"دارای صلاحیت برای سطح اعتماد 3.","does_not_qualify":"فاقد صلاحیت برای سطح اعتماد 3.","will_be_promoted":"به‌زودی ترفیع درجه خواهد گرفت.","will_be_demoted":"به‌زودی تنزل درجه خواهد گرفت.","on_grace_period":"در حال حاضر در مهلت ارتقا٬ تنزل نخواهد گرفت.","locked_will_not_be_promoted":"سطح اعتماد بسته شده. دیگر ترفیع درجه نخواهد گرفت.","locked_will_not_be_demoted":"سطح اعتماد بسته شده. دیگردرجه تنزل نخواهد گرفت."},"sso":{"title":"ورود یکپارچه به سیستم","external_id":" ID خارجی","external_username":"نام کاربری","external_name":"نام","external_email":"ایمیل","external_avatar_url":"URL تصویر نمایه"}},"user_fields":{"title":"زمینه های  کاربر","help":"به فیلدهایی که کاربرانتان می‌توانند پر کنند اضافه کنید.","create":"ساخت فیلد برای کاربر","untitled":"بدون عنوان","name":"نام فیلد","type":"نوع فیلد","description":"توضیحات فیلد","save":"ذخیره کردن","edit":"ویرایش","delete":"حذف","cancel":"لغو کردن","delete_confirm":"آیا برای حذف این فیلد کاربری مطمئن هستید ؟","required":{"title":"مورد نیاز در ثبت نام؟","enabled":"مورد نیاز ","disabled":"مورد نیاز نیست "},"editable":{"title":"قابل ویرایش بعد از ثبت نام؟","enabled":"قابل ویرایش","disabled":"غیر قابل ویرایش"},"show_on_profile":{"title":"در نمایه عمومی نمایش داده شود؟","enabled":"نمایش در نمایه","disabled":"در نمایه نشان ندهد"},"field_types":{"text":"فیلد متن","confirm":"تاییدیه"}},"site_text":{"none":"یک دسته‌ از محتویات را برای آغاز ویرایش انتخاب کنید.","title":"محتویات متن"},"site_settings":{"show_overriden":"تنها بازنویسی‌شده‌ها را نمایش بده","title":"تنظیمات","reset":"بازنشانی","none":"هیچ کدام","no_results":"چیزی یافت نشد.","clear_filter":"واضح","add_url":"اضافه کردن URL","add_host":"اضافه کردن هاست","categories":{"all_results":"همه","required":"مورد نیاز","basic":"راه اندازی اولیه","users":"کاربران","posting":"در حال نوشتن","email":"رایانامه","files":"پرونده‌ها","trust":"سطح اعتماد","security":"امنیت","onebox":"یک جعبه","seo":"SEO","spam":"هرزنامه","rate_limits":"میزان محدودیت ها ","developer":"توسعه دهنده","embedding":"توکاری","legal":"حقوقی","uncategorized":"دیگر","backups":"پشتیبان‌ها","login":"ورود","plugins":"افزونه ها"}},"badges":{"title":"مدال ها","new_badge":"مدال جدید","new":"جدید","name":"نام","badge":"مدال","display_name":"نام نمایشی","description":"توضیح","badge_type":"نوع مدال","badge_grouping":"گروه","badge_groupings":{"modal_title":"گروه بندی مدال"},"granted_by":"اعطا شده توسط","granted_at":"اعطا شده در","reason_help":"(یک لینک به یک نوشته یا موضوع)","save":"ذخیره سازی","delete":"پاک کردن","delete_confirm":"آیا مطمئنید که می‌خواهید این مدال را پاک کنید؟","revoke":"ابطال ","reason":"دلیل","expand":"گستردن hellip\u0026;","revoke_confirm":"آیا مطمئنید که می‌خواهید این مدال را باطل کنید؟","edit_badges":"ویرایش مدال‌ها","grant_badge":"اعطای مدال","granted_badges":"مدال های اعطایی","grant":"اهداء","no_user_badges":"%{name} هیچ مدالی دریافت نکرده است.","no_badges":"مدالی برای اعطا کردن وجود ندارد.","none_selected":"برای شروع یک مدال رو انتخاب کنید","allow_title":"اجازه استفاده مدال برای عنوان","multiple_grant":"نمی توان چندین با اهداء کرد","listable":"نشان دادن مدال در صفحه مدال های عمومی","enabled":"به‌کارگیری مدال","icon":"آیکن","image":"تصویر","icon_help":"استفاده از یک نوع فونا باحال  یا URL به یک تصویر","query":"پرس جوی مدال (SQL)","target_posts":"پرس و جو نوشته های هدف","auto_revoke":"لفو اجرای روزانه پروس و جو","show_posts":"نمایش نوشته ای که در آن مدال اهداء شده در صفحه مدال ها","trigger":"گیره","trigger_type":{"none":"به‌روزرسانی روزانه","post_action":"هنگامی‌که کاربری روی نوشته ای کاری انجام می‌دهد","post_revision":"هنگامی که یک کاربر نوشته ای ویرایش می‌کند یا فرستد","trust_level_change":"هنگامی که کاربری سطح اعتماد را تغییر می‌دهد","user_change":"هنگامی که کاربری ویرایش یا ساخته می‌شود"},"preview":{"link_text":"پیش نمایش مدال های اعطایی","plan_text":"پیشنمایش با طرح پرسش","modal_title":"پیشنمایش پرسش مدال ","sql_error_header":"خطایی با پرسش وجود دارد","error_help":"پیروی کنید از پیوند برای کمک در رابطه با پرسش مدال ها","bad_count_warning":{"header":"هشدار!","text":"نمونه اعطای گم شده وجود دارد. این اتفاق زمانی می افتد که پرس و جوuser IDs یا post IDs که وجود ندارد را برمی گرداند. این ممکن است باعث خیلی از نتایج غیر منتظره بعد از آن شود - لطفا دوباره بررسی کنید."},"sample":"نمونه:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e برای نوشته در %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e برای نوشته %{link} در \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e در \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"شکلک","help":"اضافه کردن شکلک های جدید که در دسترس همگان خواهد بود.(PROTIP: کشیدن و رها کردن فایل های چندگانه در یک بار)","add":"افزودن شکلک جدید","name":"نام","image":"تصویر","delete_confirm":"آیا مطمئنید که می‌خواهید شکلک :{name}%: را پاک کنید؟"},"permalink":{"title":" پیوند دائمی","url":"آدرس","topic_id":"شناسه موضوع","topic_title":"موضوع","post_id":"شناسه نوشته","post_title":"نوشته","category_id":"شناسه دسته بندی","category_title":"دسته بندی","external_url":" آدرس خارجی","delete_confirm":"آیا مطمئنید که می‌خواهید این لینک دائمی را پاک کنید؟","form":{"label":"جدید:","add":"افزودن","filter":"جستجو (آدرس یا آدرس خارجی)"}}},"lightbox":{"download":"دریافت"},"search_help":{"title":"کمک جستجو"},"keyboard_shortcuts_help":{"title":"میانبر‌های صفحه کلید","jump_to":{"title":"بپر به","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e خانه","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003eآخرین","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e جدید","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e خوانده نشده","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e دسته بندی ها","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e بالا ترین","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e نشانک‌ها"},"navigation":{"title":"راهبری","jump":"\u003cb\u003e#\u003c/b\u003e رفتن به نوشته #","back":"برگشت","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e انتقال انتخاب شده \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e باز کردن موضوع انتخاب شده","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e بخش قبلی/بعدی"},"application":{"title":"نرم‌افزار","create":"\u003cb\u003ec\u003c/b\u003e ساختن یک موضوع جدید","notifications":"\u003cb\u003en\u003c/b\u003e باز کردن آگاه‌سازی‌ها","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e باز کردن منوی کاربران","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e نمایش موضوعات بروز شده","search":"\u003cb\u003e/\u003c/b\u003e جستجو","help":"\u003cb\u003e?\u003c/b\u003e باز کردن راهنمای کیبورد","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003eبستن جدید/نوشته ها ","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e بستن موضوعات"},"actions":{"title":"اقدامات","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e تعویض نشانک موضوع","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e سنجاق /لغو سنجاق موضوع","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e اشتراک گذاری نوشته","share_post":"به اشتراک‌گذاری نوشته","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e پاسخگویی به عنوان یک موضوع لینک شده","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e پاسخ به موضوع","reply_post":"\u003cb\u003er\u003c/b\u003e پاسخ به نوشته","quote_post":"نقل‌قول نوشته","like":"\u003cb\u003el\u003c/b\u003e پسندیدن نوشته","flag":"\u003cb\u003e!\u003c/b\u003e پرچم‌گذاری نوشته","bookmark":"\u003cb\u003eb\u003c/b\u003e نشانک‌گذاری نوشته","edit":"\u003cb\u003ee\u003c/b\u003e ویرایش نوشته","delete":"\u003cb\u003ed\u003c/b\u003e پاک کردن نوشته","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e بی صدا کردن موضوع","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e تنظیم ( پیش فرض) موضوع","mark_tracking":"b\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e پیگری جستار","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e مشاهده موضوع"}},"badges":{"title":"مدال‌ها","allow_title":"می تواند برای یک عنوان استفاده شود","multiple_grant":"می توان چندین بار اهدا کرد","badge_count":{"other":"%{count} مدال"},"more_badges":{"other":"+%{count} بیش‌تر"},"granted":{"other":"%{count} اعطا شد"},"select_badge_for_title":"انتخاب یک مدال برای استفاده در عنوان خود","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"شروع"},"community":{"name":"انجمن"},"trust_level":{"name":"سطح اعتماد"},"other":{"name":"دیگر"},"posting":{"name":"در حال نوشتن"}},"badge":{"editor":{"name":"ویرایشگر","description":"نخستین ویرایش نوشته"},"basic_user":{"name":"اساسی","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eاعطا کردن\u003c/a\u003e تمام عملکرد های ضروری برای انجمن"},"member":{"name":"عضو","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eاعطا کردن\u003c/a\u003e دعوت نامه"},"regular":{"name":"منظم","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003ea\u003e دعوت نامه تغییر دسته بندی، تغییر نام دهید، به دنبال کردن لینک ها و سالن"},"leader":{"name":"رهبر","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eاعطا کردن\u003c/a\u003e\nویرایش سراسری، پین، بستن، بایگانی، تقسیم و ادغام"},"welcome":{"name":"خوش آمدید","description":" یک پسند دریافت شد"},"autobiographer":{"name":"نویسندهء شرح حال","description":"فیلد کاربر \u003ca href=\"/my/preferences\"\u003eنمایه \u003c/a\u003eاطلاعات"},"anniversary":{"name":"سالگرد","description":"عضو فعال به مدت یک سال،ارسال شده حداقل یک بار"},"nice_post":{"name":"نوشته‌ی دلپذیر","description":"دریافت 10 پسند در یک نوشته. این نشان را می توان چندین بار اعطا کرد"},"good_post":{"name":"نوشته‌ی خوب","description":"دریافت 25 پسند در یک نوشته. این نشان را می توان چندین بار اعطا کرد"},"great_post":{"name":"نوشته‌ی عالی","description":"دریافت 50 پسند در یک نوشته. این نشان را می توان چندین بار اعطا کرد"},"nice_topic":{"name":"موضوع دلپذیر","description":"دریافت 10 پسند در یک موضوع. این نشان را می توان چندین بار اعطا کرد"},"good_topic":{"name":"موضوع خوب","description":"دریافت 25 پسند در یک موضوع. این نشان را می توان چندین بار اعطا کرد"},"great_topic":{"name":"موضوع عالی","description":"دریافت 50 پسند در یک موضوع. این نشان را می توان چندین بار اعطا کرد"},"nice_share":{"name":"ا‌شتراک‌گذاری خوب","description":"اشتراک گذاری نوشته با 25 بازدید کننده منحصر به فرد"},"good_share":{"name":"اشتراک‌گذاری خوب","description":"اشتراک گذاری نوشته با 300 بازدید کننده منحصر به فرد"},"great_share":{"name":"اشتراک‌گذاری عالی","description":"اشتراک گذاری نوشته با 1000 بازدید کننده منحصر به فرد"},"first_like":{"name":"نخستین پسند","description":"نوشته ای را پسندید"},"first_flag":{"name":"پرچم نخست","description":"نوشته را پرچم زد"},"promoter":{"name":"ترویج دهنده","description":"دعوت کننده یک کاربر"},"campaigner":{"name":"فعال","description":"دعوت کننده سه کاربر معمولی (سطح اعتماد ۱)"},"champion":{"name":"قهرمان","description":"دعوت کننده پنج کاربر عضو (سطح اعتماد ۲)"},"first_share":{"name":"نخستین اشتراک‌گذاری","description":"نوشته ای به اشتراک گذاشته شده"},"first_link":{"name":"پیوند نخست","description":"لینک های داخلی اضافه شده به دیگر موضوعات"},"first_quote":{"name":"نقل‌قول نخست","description":"نقل قول یک کاربر"},"read_guidelines":{"name":"خواندن دستورالعمل ها","description":"خواندن \u003ca href=\"/guidelines\"\u003eدستورالعمل های انجمن\u003c/a\u003e"},"reader":{"name":"خواننده","description":"مطالعه تمام نوشته‌هایی در یک  موضوع  که بیش از 100 نوشته دارد."}}}}},"en":{"js":{"number":{"human":{"storage_units":{"units":{"byte":{"one":"Byte"}}}}},"dates":{"tiny":{"less_than_x_seconds":{"one":"\u003c 1s"},"x_seconds":{"one":"1s"},"less_than_x_minutes":{"one":"\u003c 1m"},"x_minutes":{"one":"1m"},"about_x_hours":{"one":"1h"},"x_days":{"one":"1d"},"about_x_years":{"one":"1y"},"over_x_years":{"one":"\u003e 1y"},"almost_x_years":{"one":"1y"}},"medium":{"x_minutes":{"one":"1 min"},"x_hours":{"one":"1 hour"},"x_days":{"one":"1 day"}},"medium_with_ago":{"x_minutes":{"one":"1 min ago"},"x_hours":{"one":"1 hour ago"},"x_days":{"one":"1 day ago"}},"later":{"x_days":{"one":"1 day later"},"x_months":{"one":"1 month later"},"x_years":{"one":"1 year later"}}},"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","links_lowercase":{"one":"link"},"character_count":{"one":"{{count}} character"},"topic_count_latest":{"one":"{{count}} new or updated topic."},"topic_count_unread":{"one":"{{count}} unread topic."},"topic_count_new":{"one":"{{count}} new topic."},"uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval"},"approval":{"pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending."}}},"directory":{"total_rows":{"one":"1 user"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","title":{"one":"group"},"trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"},"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}."}},"user_fields":{"none":"(select an option)"},"user":{"expand_profile":"Expand","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_default":"Turn On Notifications","perm_denied_btn":"Permission Denied","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","disable":"Disable Notifications","currently_enabled":"(currently enabled)","enable":"Enable Notifications","currently_disabled":"(currently disabled)","each_browser_note":"Note: You have to change this setting on every browser you use."},"blocked_tooltip":"This user is blocked","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_avatar":{"cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","replies_lowercase":{"one":"reply"},"signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"login":{"to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again","selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic."}}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"new_topics":{"one":"1 new topic"},"unread_topics":{"one":"1 unread topic"},"total_unread_posts":{"one":"you have 1 unread post in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"regular":{"title":"Normal"},"regular_pm":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","filters":{"n_posts":{"one":"1 post"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)"},"gap":{"one":"view 1 hidden reply"},"has_replies":{"one":"{{count}} Reply"},"has_likes":{"one":"{{count}} Like"},"has_likes_title":{"one":"1 person liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?"}},"change_owner":"Change Ownership"},"actions":{"defer_flags":{"one":"Defer flag"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post"},"like":{"one":"You and 1 other liked this"},"vote":{"one":"You and 1 other voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post"},"like":{"one":"1 person liked this"},"vote":{"one":"1 person voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?"}}},"category":{"create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_map":{"clicks":{"one":"1 click"}},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"views_lowercase":{"one":"view"},"likes_lowercase":{"one":"like"},"users_lowercase":{"one":"user"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"quarterly":{"title":"Quarterly"},"this_quarter":"Quarter"}},"poll":{"voters":{"one":"voter"},"total_votes":{"one":"total vote"},"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"flags":{"summary":{"action_type_3":{"one":"off-topic"},"action_type_4":{"one":"inappropriate"},"action_type_6":{"one":"custom"},"action_type_7":{"one":"custom"},"action_type_8":{"one":"spam"}}},"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"embedded_css":"Embedded CSS","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}}},"users":{"approved_selected":{"one":"approve user"},"reject_selected":{"one":"reject user"},"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"},"reject_successful":{"one":"Successfully rejected 1 user."},"reject_failures":{"one":"Failed to reject 1 user."}},"user":{"delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)"}},"user_fields":{"options":"Options","field_types":{"dropdown":"Dropdown"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge_count":{"one":"1 Badge"},"more_badges":{"one":"+1 More"},"granted":{"one":"1 granted"},"badge":{"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'fa_IR';
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
moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};

I18n.pluralizationRules['fa_IR'] = function (n) {
   return "other";
};
