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
    })({"topic.read_more_MF" : function(){ return "Invalid Format: Plural Function not found for locale: bs_BA";} , "posts_likes_MF" : function(){ return "Invalid Format: Plural Function not found for locale: bs_BA";}});I18n.translations = {"bs_BA":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Bajt","few":"Bajta","other":"Bajta"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}} hiljada","millions":"{{number}} miliona"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1 sekunda","few":"\u003c %{count} sekundi","other":"\u003c %{count} sekundi"},"x_seconds":{"one":"1 sekunda","few":"%{count} sekundi","other":"%{count} sekundi"},"less_than_x_minutes":{"one":"\u003c1 minuta","few":"%{count} minuta","other":"%{count} minuta"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuta","few":"Par minuta","other":"%{count} minuta"},"x_hours":{"one":"1 sahat","few":"Par sahati","other":"%{count} sahati"},"x_days":{"one":"1 dan","few":"Par dana","other":"%{count} dana"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"one":"Prije 1 minutu","few":"Prije par minuta","other":"%{count} minuta prije"},"x_hours":{"one":"Prije 1 sahat ","few":"Prije par sahati","other":"%{count} sahati prije"},"x_days":{"one":"prije 1 dan ","few":"Prije par dana ","other":"%{count} dana prije"}},"later":{"x_days":{"one":"Prije 1 dan","few":"Prije par dana","other":"%{count} dana prije"},"x_months":{"one":"Prije 1 mjesec","few":"Prije par mjeseci","other":"%{count} mjeseci prije"},"x_years":{"one":"Prije 1 godinu","few":"Prije par godina","other":"%{count} godine/a prije"}}},"share":{"topic":"podjeli link ka ovoj temi","post":"podjeli link ka ovom postu #%{postNumber}","close":"zatvori","twitter":"podjeli link na Twitteru","facebook":"podjeli link na Facebooku","google+":"podjeli link na Google+","email":"pošalji ovaj link na email"},"topic_admin_menu":"topic admin actions","edit":"izmjeni naslov i kategoriju ove teme","not_implemented":"That feature hasn't been implemented yet, sorry!","no_value":"Ne","yes_value":"Da","generic_error":"Uff, došlo je do greške.","generic_error_with_reason":"Došlo je do greške: %{error}","sign_up":"Kreiraj Nalog","log_in":"Uloguj se","age":"Godište","joined":"Registrovan","admin_title":"Admin","flags_title":"Opomene","show_more":"pokaži još","links":"Linkovi","links_lowercase":{"one":"Link","few":"Link","other":"Linkovi"},"faq":"Upoznavanje Foruma","guidelines":"Guidelines","privacy_policy":"Privacy Policy","privacy":"Privacy","terms_of_service":"Terms of Service","mobile_view":"Mobilni Ekran","desktop_view":"Desktop Ekran","you":"Ti","or":"ili","now":"upravo sada","read_more":"pročitaj","more":"Više","less":"Manje","never":"nikada","daily":"dnevno","weekly":"nedeljno","every_two_weeks":"svake dvije nedelje","every_three_days":"Svako 3 dana","max_of_count":"maksimalno {{count}}","alternation":"ili","character_count":{"one":"{{count}} karakter","few":"{{count}} karaktera","other":"{{count}} karaktera"},"suggested_topics":{"title":"Savetujemo Teme"},"about":{"simple_title":"O Nama","title":"O Nama %{title}","stats":"Statistika Sajta","our_admins":"Naši Admini","our_moderators":"Naši Moderatori","stat":{"all_time":"Svih Vremena","last_7_days":"Zadnjih 7 Dana","last_30_days":"Zadnjih 30 dana"},"like_count":"Broj Lajkova","topic_count":"Broj Tema","post_count":"Broj Postova","user_count":"Broj Članova","active_user_count":"Aktivnih korisnika","contact":"Kontaktirajte nas","contact_info":"U slučaju da forum ne radi, molimo kontaktirajte nas na %{contact_info}."},"bookmarked":{"title":"Bookmark","clear_bookmarks":"Očisti bookmark","help":{"bookmark":"Klikni da bookmarkuješ prvi post u temi","unbookmark":"Klikni da ukloniš sve bookmarke iz ove teme"}},"bookmarks":{"not_logged_in":"sorry, you must be logged in to bookmark posts","created":"you've bookmarked this post","not_bookmarked":"you've read this post; click to bookmark it","last_read":"this is the last post you've read; click to bookmark it","remove":"Remove Bookmark","confirm_clear":"Jeste li sigurni da želite očistiti sve bookmarke iz ove kategorije?"},"topic_count_latest":{"one":"{{count}} nova ili tema sa editovanim postom.","few":"{{count}} novih ili tema sa editovanim postovima.","other":"{{count}} novih ili tema sa editovanim postovima."},"topic_count_unread":{"one":"{{count}} nepročitana tema.","few":"{{count}} nepročitanih tema.","other":"{{count}} nepročitanih tema."},"topic_count_new":{"one":"{{count}} nova tema.","few":"{{count}} novih tema.","other":"{{count}} novih tema."},"click_to_show":"Klikni da pokažeš.","preview":"pregledaj","cancel":"otkaži","save":"Sačuvaj Promjene","saving":"Čuvam...","saved":"Sačuvano!","upload":"Uploaduj","uploading":"Uploduje se...","uploaded":"Uplodovano!","enable":"Enable","disable":"Disable","undo":"Undo","revert":"Revert","failed":"Failed","switch_to_anon":"Anonimni mod","banner":{"close":"Dismiss this banner.","edit":"Uredite ovaj baner \u003e\u003e"},"choose_topic":{"none_found":"Nema pronađenih tema.","title":{"search":"Search for a Topic by name, url or id:","placeholder":"type the topic title here"}},"queue":{"topic":"Tema:","approve":"Odobri","reject":"Odbij","delete_user":"Izbriši korisnika","title":"Potrebno odobrenje","none":"Nema postova za pregled.","edit":"Uredi","cancel":"Odustani","view_pending":"Vidi postove na čekanju","has_pending_posts":{"one":"Ova tema ima \u003cb\u003e1\u003c/b\u003e post koji čeka odobrenje","few":"Ova tema ima \u003cb\u003e{{count}}\u003c/b\u003e postova koji čekaju odobrenje","other":"Ova tema ima \u003cb\u003e{{count}}\u003c/b\u003e postova koji čekaju odobrenje"},"confirm":"Sačuvaj promjene","delete_prompt":"Jeste li sigurni da želite izbrisati \u003cb\u003e%{username}\u003c/b\u003e? Ovo će izbrisati sve njihove postove i blokirati njihovu email i IP adresu.","approval":{"title":"Post treba odobrenje","description":"Primili smo Vaš novi post ali on treba biti odobren od strane moderatora prije nego bude javno dostupan. Molimo budite strpljivi.","pending_posts":{"one":"Imate \u003cstrong\u003e1\u003c/strong\u003e post na čekanju.","few":"Imate \u003cstrong\u003e{{count}}\u003c/strong\u003e postova na čekanju.","other":"Imate \u003cstrong\u003e{{count}}\u003c/strong\u003e postova na čekanju."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e posted \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e posted \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e replied to \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e replied to \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e replied to \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e replied to \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mentioned \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mentioned \u003ca href='{{user2Url}}'\u003eyou\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eYou\u003c/a\u003e mentioned \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Posted by \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Posted by \u003ca href='{{userUrl}}'\u003eyou\u003c/a\u003e","sent_by_user":"Sent by \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Sent by \u003ca href='{{userUrl}}'\u003eyou\u003c/a\u003e"},"directory":{"title":"Korisnici","topic_count":"Teme","post_count":"Replike","days_visited":"Posijete","total_rows":{"one":"%{count} korisnik","few":"%{count} korisnika","other":"%{count} korisnika"}},"groups":{"visible":"Grupa je vidljiva svim korisnicima","title":{"one":"grupa","few":"grupe","other":"grupe"},"members":"Članovi","posts":"Postovi","alias_levels":{"title":"Who can use this group as an alias?","nobody":"Niko","only_admins":"Samo admini","mods_and_admins":"Samo moderatori i Admini","members_mods_and_admins":"Samo članovi grupe, moderatori i admini","everyone":"Svatko"}},"user_action_groups":{"1":"Dati Lajkovi","2":"Dobijeni Lajkovi","3":"Sačuvano","4":"Teme","5":"Postovi","6":"Odgovori","7":"Spemenute","9":"Citirane","10":"Označene","11":"Izmjenjene","12":"Poslato","13":"Inbox"},"categories":{"all":"Sve kategorije","all_subcategories":"sve","no_subcategory":"nijedna","category":"Kategorija","posts":"Odgovori","topics":"Teme","latest":"Najnovije","latest_by":"zadnje od","toggle_ordering":"toggle ordering control","subcategories":"Podkategorije","topic_stats":"Broj novih tema.","post_stats":"Broj novih postova."},"ip_lookup":{"title":"IP Address Lookup","hostname":"Hostname","location":"Location","location_not_found":"(unknown)","organisation":"Organization","phone":"Phone","other_accounts":"Other accounts with this IP address"},"user":{"said":"{{username}}:","profile":"Profil","mute":"Mutiraj","edit":"Uredi Postavke","download_archive":"skini arhivu mojih odgovora","private_message":"Privatne Poruke","private_messages":"Poruke","activity_stream":"Aktivnost","preferences":"Postavke","bookmarks":"Sačuvano","bio":"O Meni","invited_by":"Pozvan Od","trust_level":"Nivo Povjerenja","notifications":"Obaviještenja","disable_jump_reply":"Don't jump to your new post after replying","dynamic_favicon":"Show incoming message notifications on favicon (experimental)","edit_history_public":"Let other users view my post revisions","external_links_in_new_tab":"Open all external links in a new tab","enable_quoting":"Enable quote reply for highlighted text","change":"promjeni","moderator":"{{user}} je moderator","admin":"{{user}} je admin","moderator_tooltip":"This user is a moderator","admin_tooltip":"This user is an admin","suspended_notice":"This user is suspended until {{date}}.","suspended_reason":"Reason: ","mailing_list_mode":"Receive an email for every new post (unless you mute the topic or category)","watched_categories":"Watched","tracked_categories":"Tracked","muted_categories":"Muted","delete_account":"Delete My Account","delete_account_confirm":"Are you sure you want to permanently delete your account? This action cannot be undone!","deleted_yourself":"Your account has been deleted successfully.","delete_yourself_not_allowed":"You cannot delete your account right now. Contact an admin to do delete your account for you.","unread_message_count":"Poruke","staff_counters":{"flags_given":"helpful flags","flagged_posts":"flagged posts","deleted_posts":"deleted posts","suspensions":"suspensions","warnings_received":"warnings"},"messages":{"all":"Sve","mine":"Moje","unread":"Nepročitane"},"change_password":{"success":"(email poslat)","in_progress":"(šaljem email)","error":"(greška)","action":"Pošalji Email za Resetovanje Šifre","set_password":"Namjesti Šifru"},"change_about":{"title":"Promjeni o Meni"},"change_username":{"title":"Change Username","confirm":"If you change your username, all prior quotes of your posts and @name mentions will be broken. Are you absolutely sure you want to?","taken":"Sorry, that username is taken.","error":"There was an error changing your username.","invalid":"That username is invalid. It must only include numbers and letters"},"change_email":{"title":"Change Email","taken":"Sorry, that email is not available.","error":"There was an error changing your email. Perhaps that address is already in use?","success":"We've sent an email to that address. Please follow the confirmation instructions."},"change_avatar":{"title":"Promjeni sliku","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, baziran na","refresh_gravatar_title":"Osvježi Gravatar","letter_based":"Avatar dodjeljen od sistema","uploaded_avatar":"Vaša slika","uploaded_avatar_empty":"Dodajte vašu sliku","upload_title":"Uploduj sliku","upload_picture":"Upload slike","image_is_not_a_square":"Upozorenje: morali smo izrezat vašu sliku; nije bila kvadrat."},"change_profile_background":{"title":"Pozadina profila"},"email":{"title":"Email","instructions":"Nikada se ne pokazuje javno.","ok":"Izgleda dobro. Poslat ćemo email sa konfirmacijom.","invalid":"Molimo vas unesite validnu email adresu.","authenticated":"Your email has been authenticated by {{provider}}."},"name":{"title":"Ime","instructions":"Vaše puno ime.","too_short":"Vaše ime je prekratko.","ok":"Vaše ime izgleda ok."},"username":{"title":"Nadimak","instructions":"Originalno, bez razmaka, kratko.","short_instructions":"Ljudi vas mogu spomenuti preko @{{username}}.","available":"Vaš nadimak je dostupan.","global_match":"Email već postoji kao član foruma.","global_mismatch":"Već ste registrovani. Probajte {{suggestion}}?","not_available":"Nije dostupan. Pokušaj {{suggestion}}?","too_short":"Vaš nadimak je prekratak.","too_long":"Vaš nadima je predugačak.","checking":"Provjeravamo dostupnost...","enter_email":"Nadimak nađen. Unesite vaš email.","prefilled":"Email je registrovan na ovaj nadimak."},"locale":{"title":"Interface language","instructions":"User interface language. It will change when you refresh the page.","default":"(default)"},"password_confirmation":{"title":"Šifra Opet"},"last_posted":"Posljednji Odgovor","last_emailed":"Poslat Email","last_seen":"Viđen","created":"Registrovan","log_out":"Izloguj se","location":"Lokacija","website":"Sajt","email_settings":"Email","email_digests":{"title":"Kada ne dolazite na sajt, šaljevo vam email sa novim temama:","daily":"dnevno","weekly":"nedeljno"},"email_direct":"Receive an email when someone quotes you, replies to your post, or mentions your @username","email_private_messages":"Receive an email when someone sends you a private message","other_settings":"Other","categories_settings":"Categories","new_topic_duration":{"label":"Consider topics new when","not_viewed":"you haven't viewed them yet","last_here":"created since you were here last"},"auto_track_topics":"Automatically track topics you enter","auto_track_options":{"never":"never"},"invited":{"search":"kucaj da potražiš pozivnice...","title":"Pozivnice","user":"Pozvan Korisnik","redeemed":"Redeemed Invites","redeemed_at":"Redeemed","pending":"Pending Invites","topics_entered":"Topics Viewed","posts_read_count":"Posts Read","expired":"This invite has expired.","rescind":"Remove","rescinded":"Invite removed","reinvite":"Resend Invite","reinvited":"Invite re-sent","time_read":"Read Time","days_visited":"Days Visited","account_age_days":"Account age in days","create":"Pošalji Pozivnicu","bulk_invite":{"none":"You haven't invited anyone here yet. You can send individual invites, or invite a bunch of people at once by \u003ca href='https://revolucionar.com/t/send-bulk-invites/16468'\u003euploading a bulk invite file\u003c/a\u003e.","text":"Bulk Invite from File","uploading":"Uploading...","success":"File uploaded successfully, you will be notified shortly with progress.","error":"There was an error uploading '{{filename}}': {{message}}"}},"password":{"title":"Šifra","too_short":"Vaša šifra je prekratka.","common":"Vaša šifra je previše obična.","ok":"Vaša šifra izgleda ok.","instructions":"Barem %{count} karaktera."},"associated_accounts":"Associated accounts","ip_address":{"title":"Zadnja IP Adresa"},"registration_ip_address":{"title":"IP Adresa prilikom registracije"},"avatar":{"title":"Slika"},"title":{"title":"Title"},"filters":{"all":"Sve"},"stream":{"posted_by":"Stavljeno od","sent_by":"Poslato od","private_message":"private message","the_topic":"tema"}},"loading":"Učitava se...","errors":{"prev_page":"dok pokušava da uloduje","reasons":{"network":"Network Greška","server":"Server Greška","forbidden":"Pristup Nedostupan","unknown":"Greška"},"desc":{"network":"Please check your connection.","network_fixed":"Looks like it's back.","server":"Error code: {{status}}","forbidden":"You're not allowed to view that.","unknown":"Something went wrong."},"buttons":{"back":"Idi Nazad","again":"Pokušaj Opet","fixed":"Uloduj Stranicu"}},"close":"Zatvori","assets_changed_confirm":"Ovaj sajt je upravo unaprijeđen. Osvježi stranicu za novu verziju?","read_only_mode":{"enabled":"An administrator enabled read-only mode. You can continue to browse the site but interactions may not work.","login_disabled":"Login is disabled while the site is in read only mode."},"learn_more":"learn more...","year":"godina","year_desc":"teme kreirane u zadnjih 365 dana","month":"mjesec","month_desc":"teme kreirane u zadnjih 30 dana","week":"nedelja","week_desc":"teme kreirane u zadnjih 7 dana","day":"dan","first_post":"Prvi post","mute":"Mutiraj","unmute":"Odmutiraj","last_post":"Zadnji post","summary":{"enabled_description":"You're viewing a summary of this topic: the most interesting posts as determined by the community.","description":"There are \u003cb\u003e{{count}}\u003c/b\u003e replies.","description_time":"There are \u003cb\u003e{{count}}\u003c/b\u003e replies with an estimated read time of \u003cb\u003e{{readingTime}} minutes\u003c/b\u003e.","enable":"Summarize This Topic","disable":"Show All Posts"},"deleted_filter":{"enabled_description":"This topic contains deleted posts, which have been hidden. ","disabled_description":"Deleted posts in the topic are shown.","enable":"Hide Deleted Posts","disable":"Show Deleted Posts"},"private_message_info":{"title":"Privatna Poruka","invite":"Pozovi Druge...","remove_allowed_user":"Do you really want to remove {{name}} from this private message?"},"email":"Email","username":"Ime","last_seen":"Viđen","created":"Kreiran","created_lowercase":"kreiran","trust_level":"Nivo Povjerenja","search_hint":"ime","create_account":{"title":"Kreiraj Nalog","failed":"Something went wrong, perhaps this email is already registered, try the forgot password link"},"forgot_password":{"title":"Zaboravili ste Šifru","action":"Zaboravio šifru","invite":"Upišite vaš email ili korisničko ime i mi ćemo vam poslati link za resetovanje šifre.","reset":"Resetuj Šifru","complete_username":"Ako se vaš nalog podudara sa korisnikom \u003cb\u003e%{username}\u003c/b\u003e, uskoro ćete primiti email koji će vam objasniti kako da resetujete vašu šifru.","complete_email":"Ako se vaš nalog podudara sa \u003cb\u003e%{email}\u003c/b\u003e, uskoro ćete primiti email koji će vam objasniti kako da resetujete vašu šifru.","complete_username_found":"Našli smo nalog koji odgovara korisniku \u003cb\u003e%{username}\u003c/b\u003e, uskoro ćete primiti email koji će vam objasniti kako da resetujete vašu šifru.","complete_email_found":"Našli smo nalog koji odgovara email-u \u003cb\u003e%{email}\u003c/b\u003e, uskoro ćete primiti email koji će vam objasniti kako da resetujete vašu šifru.","complete_username_not_found":"Nema naloga sa korisničkim imenom \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Nema naloga sa email-om \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Uloguj se","username":"Korisnik","password":"Šifra","email_placeholder":"email ili korisnik","caps_lock_warning":"Uključena su vam velika slova","error":"Nepoznata greška","blank_username_or_password":"Please enter your email or username, and password.","reset_password":"Resetuj Šifru","logging_in":"Ulogujem se...","or":"Or","authenticating":"Autorizacija...","awaiting_confirmation":"Vaš nalog čeka aktivaciju, koristite opciju za ponovno slanje aktivacije.","awaiting_approval":"Your account has not been approved by a staff member yet. You will be sent an email when it is approved.","requires_invite":"Sorry, access to this forum is by invite only.","not_activated":"You can't log in yet. We previously sent an activation email to you at \u003cb\u003e{{sentTo}}\u003c/b\u003e. Please follow the instructions in that email to activate your account.","not_allowed_from_ip_address":"You can't login from that IP address.","resend_activation_email":"Click here to send the activation email again.","sent_activation_email_again":"We sent another activation email to you at \u003cb\u003e{{currentEmail}}\u003c/b\u003e. It might take a few minutes for it to arrive; be sure to check your spam folder.","google":{"title":"sa Google","message":"Authenticating with Google (make sure pop up blockers are not enabled)"},"google_oauth2":{"title":"sa Google","message":"Authenticating with Google (make sure pop up blockers are not enabled)"},"twitter":{"title":"sa Twitterom","message":"Identifikujemo se sa Twitterom (nadamo se da su vam isključeni popup blokeri)"},"facebook":{"title":"sa Facebukom","message":"Identifikujemo sa Facebukom (nadamo se da su vam isključeni popup blokeri)"},"yahoo":{"title":"sa Yahoo","message":"Authenticating with Yahoo (make sure pop up blockers are not enabled)"},"github":{"title":"sa GitHub","message":"Authenticating with GitHub (make sure pop up blockers are not enabled)"}},"composer":{"add_warning":"Ovo je zvanično upozorenje.","posting_not_on_topic":"Na koju temu želite da odgovorite?","saving_draft_tip":"čuvam","saved_draft_tip":"sačuvano","saved_local_draft_tip":"sačuvano lokalno","similar_topics":"Tvoja tema je slična...","drafts_offline":"offline sačuvano","error":{"title_missing":"Naslov je obavezan","title_too_short":"Naslov mora biti najmanje {{min}} karaktera","title_too_long":"Naslov ne može biti više od {{max}} karaktera","post_missing":"Odgovor ne može biti prazan","post_length":"Odgovor mora biti najmanje {{min}} karaktera","category_missing":"Morate odabrati kategoriju"},"save_edit":"Sačuvaj Izmene","reply_original":"Odgovori na Originalnu Temu","reply_here":"Odgovori Ovde","reply":"Odgovori","cancel":"Otkaži","create_topic":"Započni Temu","create_pm":"Kreiraj Privatnu Poruku","title":"Ili pritisni Ctrl+Enter","users_placeholder":"Dodaj člana","title_placeholder":"O čemu je ova diskusija u jednoj rečenici?","edit_reason_placeholder":"zašto pravite izmjenu?","show_edit_reason":"(dodaj razlog izmjene)","view_new_post":"Pogledaj svoj novi post.","saved":"Sačuvano!","saved_draft":"Imate sačuvan post. Kliknite ovdje da nastavite sa izmjenama","uploading":"Uplodujem...","show_preview":"pokaži pregled \u0026raquo;","hide_preview":"\u0026laquo; sakri pregled","quote_post_title":"Citiraj cjeli post","bold_title":"Bold","bold_text":"bold tekst","italic_title":"Ukošen","italic_text":"ukošen tekst","link_title":"Link","link_description":"ubaci opis linka","link_dialog_title":"Unesi Link","link_optional_text":"naslov neobavezan","quote_title":"Blok Citat","quote_text":"citat u bloku","code_title":"Formatiran Tekst","code_text":"indent preformatted text by 4 spaces","upload_title":"Upload","upload_description":"unesi opis uploada","olist_title":"Numbered List","ulist_title":"Bulleted List","list_item":"List item","heading_title":"Naslov","heading_text":"Naslov","hr_title":"Horizontalna Crta","help":"Markdown Editing Help","toggler":"sakrij ili pokaži komposer","admin_options_title":"Optional staff settings for this topic","auto_close":{"label":"Auto-close topic time:","error":"Please enter a valid value.","based_on_last_post":"Don't close until the last post in the topic is at least this old.","all":{"examples":"Enter number of hours (24), absolute time (17:30) or timestamp (2013-11-22 14:00)."},"limited":{"units":"(# of hours)","examples":"Enter number of hours (24)."}}},"notifications":{"title":"obaviještenja na spomenuti @nadimak, odgovori na vaše teme i postove, privatne poruke, itd","none":"Nemate obavijesti trenutno.","more":"pogledaj starija obaviještenja","total_flagged":"ukupno opomenutih postova","mentioned":"\u003ci title='spomenut' class='icon'\u003e@\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='citiran' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='odgovoren' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='odgovoren' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='izmjenjen' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='lajkovan' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='privatna poruka' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='privatna poruka' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='prihvatio pozivnicu' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='pomjerio post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linkovo post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='bedž dobijen' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eZaslužen '{{description}}'\u003c/p\u003e"},"upload_selector":{"title":"Dodaj sliku","title_with_attachments":"Dodaj sliku ili fajl","from_my_computer":"Sa mog uređaja","from_the_web":"Sa neta","remote_tip":"link do slike http://primjer.com/slika.jpg","hint":"(možete i mišom prenijeti vaše slike direktno iz vašeg foldera ovdje)","uploading":"Uplodujem","image_link":"link do vaše slike će pokazivati"},"search":{"title":"traži teme, postove, članove ili kategorije","no_results":"Nema rezultata.","searching":"Potražujem...","post_format":"#{{post_number}} od {{username}}","context":{"user":"Traži postove od @{{username}}","category":"Traži \"{{category}}\" kategoriju","topic":"Pretraži ovu temu"}},"go_back":"go back","not_logged_in_user":"user page with summary of current activity and preferences","current_user":"go to your user page","topics":{"bulk":{"reset_read":"Reset Read","delete":"Delete Topics","dismiss_new":"Dismiss New","toggle":"toggle bulk selection of topics","actions":"Bulk Actions","change_category":"Change Category","close_topics":"Close Topics","archive_topics":"Archive Topics","notification_level":"Change Notification Level"},"none":{"unread":"Nemate više nepročitanih tema.","new":"Nemate više novih tema.","read":"Niste pročitali nijednu temu.","posted":"Niste odgovorili ni na jednu temu.","latest":"Nema više novih tema. To je tužno.","hot":"Nema popularnih tema.","category":"Nema više tema u {{category}}.","top":"Nema više popularnih tema.","educate":{"new":"\u003cp\u003eTvoje nepročitane teme se pojavljuju ovdje.\u003c/p\u003e\u003cp\u003eNove teme imaju \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enova\u003c/span\u003e indikaciju.\u003c/p\u003e\u003cp\u003eMožete promjeniti notifikacije preko vaših \u003ca href=\"%{userPrefsUrl}\"\u003epostavki\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eTvoje nepročitane teme se pojavljuju ovdje.\u003c/p\u003e\u003cp\u003eAko imate nepročitanih postova vidjet ćete njihov broj \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e ako ste:\u003c/p\u003e\u003cul\u003e\u003cli\u003eKreirali tu temu\u003c/li\u003e\u003cli\u003eOdgovorili na tu temu\u003c/li\u003e\u003cli\u003eProveli čitajući temu više od 4 minuta\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eIli ako ste na dnu teme označili da motrite i pratite temu.\u003c/p\u003e\u003cp\u003eMožete promjeniti notifikacije preko vaših \u003ca href=\"%{userPrefsUrl}\"\u003epostavki\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Nema više novih tema.","hot":"Nema više popularnih tema.","posted":"There are no more posted topics.","read":"Nema više pročitanih tema.","new":"Nema više novih tema.","unread":"Nema više nepročitanih tema.","category":"Nema više tema na kategoriji {{category}}.","top":"Nema više popularnih tema."}},"topic":{"filter_to":"{{post_count}} odgovora u temi","create":"Započni Temu","create_long":"Započni novu Temu","private_message":"Započni privatnu konverzaciju","list":"Teme","new":"nova tema","unread":"nepročitana","title":"Tema","invalid_access":{"title":"Topic is private","description":"Sorry, you don't have access to that topic!","login_required":"You need to log in to see that topic."},"server_error":{"title":"Topic failed to load","description":"Sorry, we couldn't load that topic, possibly due to a connection problem. Please try again. If the problem persists, let us know."},"not_found":{"title":"Topic not found","description":"Sorry, we couldn't find that topic. Perhaps it was removed by a moderator?"},"back_to_list":"Vrati se na Listu Tema","options":"Opcije Teme","show_links":"pokaži linkove unutar ove teme","toggle_information":"uključi detalje teme","read_more_in_category":"Želite da pročitate još? Pogledajte druge teme u kategoriji {{catLink}} ili {{latestLink}}.","read_more":"Želite da pročitate još? {{catLink}} ili {{latestLink}}.","browse_all_categories":"Pogledajte sve Kategorije","view_latest_topics":"pogledaj posljednje teme","suggest_create_topic":"Zašto ne kreirati novu temu?","jump_reply_up":"jump to earlier reply","jump_reply_down":"jump to later reply","deleted":"Ova tema je obrisana","auto_close_notice":"This topic will automatically close %{timeLeft}.","auto_close_notice_based_on_last_post":"This topic will close %{duration} after the last reply.","auto_close_title":"Auto-Close Settings","auto_close_save":"Sačuvaj","auto_close_remove":"Don't Auto-Close This Topic","progress":{"title":"progres teme","go_top":"vrh","go_bottom":"dno","go":"idi","jump_bottom_with_number":"skoči na post %{post_number}","total":"ukupan broj","current":"trenutni post","position":"post %{current} od %{total}"},"notifications":{"reasons":{"3_6":"Dobijat ćete notifikacije zato što motrite ovu temu.","3_5":"Dobijat ćete notifikacije zato što motrite temu automatski.","3_2":"Dobijat ćete notifikacije zato što pratite ovu temu.","3_1":"Dobijat ćete notifikacije zato što ste kreirali ovu temu.","3":"Dobijat ćete notifikacije zato što motrite ovu temu.","2_8":"Dobijat ćete notifikacije zato što motrite ovu temu.","2_4":"Dobijat ćete notifikacije zato što ste ostavili odgovor na ovoj temi.","2_2":"Dobijat ćete notifikacije zato što pratite ovu temu.","2":"Dobijat ćete notifikacije zato što \u003ca href=\"/users/{{username}}/preferences\"\u003epročitao ovu temu\u003c/a\u003e.","1_2":"Dobiti ćete notifikaciju kada neko spomene tvoje @name ili odgovori na tvoj post.","1":"Dobiti ćete notifikaciju kada neko spomene tvoje @name ili odgovori na tvoj post.","0_7":"Ignorišete sve notifikacije u ovoj kategoriji.","0_2":"Ignorišete sve notifikacije u ovoj temi.","0":"Ignorišete sve notifikacije u ovoj temi."},"watching_pm":{"title":"Motrenje"},"watching":{"title":"Motrenje"},"tracking_pm":{"title":"Praćenje"},"tracking":{"title":"Praćenje"},"regular":{"title":"Regularan","description":"Dobiti ćete notifikaciju kada neko spomene tvoje @name ili odgovori na tvoj post."},"regular_pm":{"title":"Regularan","description":"Dobiti ćete notifikaciju kada neko spomene tvoje @name ili odgovori na tvoj post."},"muted_pm":{"title":"Mutirano","description":"You will never be notified of anything about this private message."},"muted":{"title":"Mutirano"}},"actions":{"recover":"Un-Delete Topic","delete":"Delete Topic","open":"Open Topic","close":"Close Topic","multi_select":"Select Posts","auto_close":"Auto Close","pin":"Pin Topic","unpin":"Un-Pin Topic","unarchive":"Unarchive Topic","archive":"Archive Topic","invisible":"Make Unlisted","visible":"Make Listed","reset_read":"Reset Read Data"},"feature":{"pin":"Prikači temu","unpin":"Otkači temu"},"reply":{"title":"Odgovori","help":"počni sa pisanjem odgovora na ovu temu"},"clear_pin":{"title":"Clear pin","help":"Clear the pinned status of this topic so it no longer appears at the top of your topic list"},"share":{"title":"Sheruj","help":"podjeli link do ove teme"},"flag_topic":{"title":"Opomena","help":"anonimno prijavi ovu temu ili pošalji privatnu notifikaciju","success_message":"Uspješno ste opomenuli ovu temu."},"feature_topic":{"title":"Istakni ovu temu."},"inviting":"Inviting...","automatically_add_to_groups_optional":"This invite also includes access to these groups: (optional, admin only)","automatically_add_to_groups_required":"This invite also includes access to these groups: (\u003cb\u003eRequired\u003c/b\u003e, admin only)","invite_private":{"title":"Invite to Private Message","email_or_username":"Invitee's Email or Username","email_or_username_placeholder":"email address or username","action":"Invite","success":"We've invited that user to participate in this private message.","error":"Sorry, there was an error inviting that user.","group_name":"group name"},"invite_reply":{"title":"Pozivnica","action":"Email pozivnica","help":"pošalji pozivnicu svojim prijateljima tako da i oni mogu odgovoriti na ovu temu. Bey registracije.","to_forum":"We'll send a brief email allowing your friend to immediately join by clicking a link, no login required.","email_placeholder":"name@example.com","error":"Sorry, we couldn't invite that person. Perhaps they are already a user?"},"login_reply":"Uloguj se da odgovoriš","filters":{"cancel":"Show all posts in this topic again."},"split_topic":{"title":"Move to New Topic","action":"move to new topic","topic_name":"Ime Nove Teme","error":"There was an error moving posts to the new topic."},"merge_topic":{"title":"Move to Existing Topic","action":"move to existing topic","error":"There was an error moving posts into that topic."},"change_owner":{"title":"Change Owner of Posts","action":"change ownership","error":"There was an error changing the ownership of the posts.","label":"New Owner of Posts","placeholder":"username of new owner","instructions_warn":"Note that any notifications about this post will not be transferred to the new user retroactively.\u003cbr\u003eWarning: Currently, no post-dependent data is transferred over to the new user. Use with caution."},"multi_select":{"select":"select","selected":"selected ({{count}})","select_replies":"select +replies","delete":"delete selected","cancel":"cancel selecting","select_all":"select all","deselect_all":"deselect all"}},"post":{"quote_reply":"citiraj odgovor","edit":"Editing {{link}} by {{replyAvatar}} {{username}}","edit_reason":"Razlog: ","post_number":"post {{number}}","last_edited_on":"post last edited on","reply_as_new_topic":"Odgovori kroz novu povezanu Temu","continue_discussion":"Nastavak diskusije od teme {{postLink}}:","follow_quote":"idi na citiran post","show_full":"Pogledaj Cijeli Post","show_hidden":"Pogledaj sakriven sadržaj.","expand_collapse":"digni/spusti","more_links":"{{count}} više...","unread":"Post je nepročitan","errors":{"create":"Sorry, there was an error creating your post. Please try again.","edit":"Sorry, there was an error editing your post. Please try again.","upload":"Sorry, there was an error uploading that file. Please try again.","attachment_too_large":"Sorry, the file you are trying to upload is too big (maximum size is {{max_size_kb}}kb).","file_too_large":"Sorry, the file you are trying to upload is too big (maximum size is {{max_size_kb}}kb)","too_many_uploads":"Sorry, you can only upload one file at a time.","upload_not_authorized":"Sorry, the file you are trying to upload is not authorized (authorized extension: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Sorry, new users can not upload images.","attachment_upload_not_allowed_for_new_user":"Sorry, new users can not upload attachments.","attachment_download_requires_login":"Sorry, you need to be logged in to download attachments."},"abandon":{"confirm":"Da li ste sigurni da želite otkazati vaš post?","no_value":"Ne, sačuvaj","yes_value":"Da, otkaži"},"via_email":"this post arrived via email","wiki":{"about":"this post is a wiki; basic users can edit it"},"archetypes":{"save":"Save Options"},"controls":{"reply":"počni da sastavljaš odgovor na ovaj post","like":"lajkuj ovaj post","has_liked":"lajkovali ste ovaj post","undo_like":"otkaži lajk","edit":"izmjeni ovaj post","edit_anonymous":"Sorry, but you need to be logged in to edit this post.","flag":"anonimno prijavi ovaj post ili pošalji privatnu notifikaciju","delete":"obriši ovaj post","undelete":"povrati obrisan post","share":"podijeli link do ovog posta","more":"Još","delete_replies":{"yes_value":"Yes, delete the replies too","no_value":"No, just this post"},"admin":"post admin actions","wiki":"Make Wiki","unwiki":"Remove Wiki","convert_to_moderator":"Add Staff Color","revert_to_regular":"Remove Staff Color","rebake":"Rebuild HTML","unhide":"Unhide"},"actions":{"flag":"Opomena","it_too":{"off_topic":"Opomeni i ti","spam":"Opomeni i ti","inappropriate":"Opomeni i ti","custom_flag":"Opomeni i ti","bookmark":"Bookmark it too","like":"Lajkuj i ti","vote":"Glasaj i ti"},"undo":{"off_topic":"Otkaži opomenu","spam":"Otkaži opomenu","inappropriate":"Otkaži opomenu","bookmark":"Otkaži bookmark","like":"Otkaži lajk","vote":"Otkaži glas"},"people":{"off_topic":"{{icons}} označio ka ne-relevatno","spam":"{{icons}} označio kao spam","inappropriate":"{{icons}} flagged this as inappropriate","notify_moderators":"{{icons}} notified moderators","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003enotified moderators\u003c/a\u003e","notify_user":"{{icons}} sent a private message","notify_user_with_url":"{{icons}} sent a \u003ca href='{{postUrl}}'\u003eprivate message\u003c/a\u003e","bookmark":"{{icons}} bookmarked this","like":"{{icons}} lajkovali ovo","vote":"{{icons}} glasali za ovo"},"by_you":{"off_topic":"You flagged this as off-topic","spam":"Opomenuo si ovo kao spam","inappropriate":"You flagged this as inappropriate","notify_moderators":"You flagged this for moderation","notify_user":"You sent a private message to this user","bookmark":"You bookmarked this post","like":"Lajkovao si ovo","vote":"Glasao si za ovaj post"}},"revisions":{"controls":{"first":"First revision","previous":"Previous revision","next":"Next revision","last":"Last revision","hide":"Hide revision","show":"Show revision"},"displays":{"inline":{"title":"Show the rendered output with additions and removals inline","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Show the rendered output diffs side-by-side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Show the raw source diffs side-by-side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Raw"}}}},"category":{"can":"can\u0026hellip; ","none":"(no category)","choose":"Select a category\u0026hellip;","edit":"edit","edit_long":"Edit","view":"View Topics in Category","general":"General","settings":"Settings","delete":"Delete Category","create":"Create Category","save":"Save Category","creation_error":"There has been an error during the creation of the category.","save_error":"There was an error saving the category.","name":"Category Name","description":"Description","topic":"category topic","logo":"Category Logo Image","background_image":"Category Background Image","badge_colors":"Badge colors","background_color":"Background color","foreground_color":"Foreground color","name_placeholder":"One or two words maximum","color_placeholder":"Any web color","delete_confirm":"Are you sure you want to delete this category?","delete_error":"There was an error deleting the category.","list":"List Categories","no_description":"Please add a description for this category.","change_in_category_topic":"Edit Description","already_used":"This color has been used by another category","security":"Security","images":"Images","auto_close_label":"Auto-close topics after:","auto_close_units":"hours","email_in":"Custom incoming email address:","email_in_allow_strangers":"Accept emails from anonymous users with no accounts","email_in_disabled":"Posting new topics via email is disabled in the Site Settings. To enable posting new topics via email, ","email_in_disabled_click":"enable the \"email in\" setting.","allow_badges_label":"Allow badges to be awarded in this category","edit_permissions":"Edit Permissions","add_permission":"Add Permission","this_year":"this year","position":"position","default_position":"Default Position","position_disabled":"Categories will be displayed in order of activity. To control the order of categories in lists, ","position_disabled_click":"enable the \"fixed category positions\" setting.","parent":"Parent Category","notifications":{"watching":{"title":"Motrenje"},"tracking":{"title":"Praćenje"},"regular":{"title":"Regularan","description":"Dobiti ćete notifikaciju kada neko spomene tvoje @name ili odgovori na tvoj post."},"muted":{"title":"Mutirano"}}},"flagging":{"title":"Zašto prijavljujete ovaj post?","action":"Opomeni Post","take_action":"Poduzmi Akciju","notify_action":"Privatna Poruka","delete_spammer":"Obriši Spamera","delete_confirm":"You are about to delete \u003cb\u003e%{posts}\u003c/b\u003e posts and \u003cb\u003e%{topics}\u003c/b\u003e topics from this user, remove their account, block signups from their IP address \u003cb\u003e%{ip_address}\u003c/b\u003e, and add their email address \u003cb\u003e%{email}\u003c/b\u003e to a permanent block list. Are you sure this user is really a spammer?","yes_delete_spammer":"Da, Obriši Spamera","ip_address_missing":"(N/A)","hidden_email_address":"(hidden)","submit_tooltip":"Predaj privatnu opomenu","take_action_tooltip":"Reach the flag threshold immediately, rather than waiting for more community flags","cant":"Nažalost, ne možete opomenuti ovaj post trenutno.","custom_placeholder_notify_user":"Zašto ovaj post nalaže da kontaktirate korisnika privatno. Budite detaljni, pristojni i korektni.","custom_placeholder_notify_moderators":"Zašto ovaj post zaslužuje pažnju moderatora. Navedite vaš razlog po mogućnosti ostavite link ako je nužno.","custom_message":{"at_least":"enter at least {{n}} characters","more":"{{n}} to go...","left":"{{n}} remaining"}},"flagging_topic":{"title":"Zašto privatno opominjete ovu temu?","action":"Opomeni Temu","notify_action":"Privatna poruka"},"topic_map":{"title":"Pregled Teme","links_shown":"pogledaj {{totalLinks}} linkova..."},"topic_statuses":{"warning":{"help":"Ovo je zvanično upozorenje."},"locked":{"help":"Ova tema je zatvorena; zvanično ne prima nove postove"},"archived":{"help":"Ova tema je arhivirana; zaleđena je i ne može biti promjenjena"},"unpinned":{"title":"Unpinned","help":"This topic is unpinned; it will display in default order"},"pinned_globally":{"title":"Zakačena Globalno"},"pinned":{"title":"Zakačena","help":"Ova tema je zakačena; biće na vrhu svoje kategorije"},"invisible":{"help":"Ovu temu sajt ne lista među najnovijim temama. Neće biti prisutna ni među listama tema unutar kategorija. Jedini način da se dođe do ove teme je direktan link"}},"posts":"Odgovori","posts_lowercase":"odgovori","posts_long":"postoji {{number}} odgovora u ovoj temi","original_post":"Originalni Odgovor","views":"Pregleda","replies":"Odgovora","views_long":"ova tema je pregledana {{number}} puta","activity":"Aktivnost","likes":"Lajkovi","likes_long":"postoji {{number}} lajkova u ovoj temi","users":"Korisnici","category_title":"Kategorija","history":"Istorija","changed_by":"od {{author}}","categories_list":"Lista Kategorija","filters":{"with_topics":"%{filter} teme","with_category":"%{filter} %{category} teme","latest":{"help":"teme sa nedavnim postovima"},"hot":{"title":"Popularne","help":"selekcija popularnih tema"},"read":{"title":"Pročitane","help":"teme koje ste pročitali, zadnje pročitane na vrhu."},"categories":{"title":"Kategorije","title_in":"Kategorija - {{categoryName}}","help":"sve teme grupisane po kategoriji"},"unread":{"help":"teme koje trenutno pratite i motrite sa nepročitanim postovima"},"new":{"lower_title":"nova","help":"teme kreirane u zadnjih nekoliko dana"},"posted":{"title":"Moji Odgovori","help":"teme u kojima imate postove"},"category":{"help":"zadnje teme u {{categoryName}} kategoriji"},"top":{"title":"Popularne","help":"najaktivnije teme u zadnjih godinu, mjesec, sedmicu i dan","yearly":{"title":"Popularne Godišnje"},"monthly":{"title":"Popularne Mjesečno"},"weekly":{"title":"Popularne Sedmično"},"daily":{"title":"Popularne Dnevno"},"today":"Danas"}},"browser_update":"Nažalost, vaš internet browser je prestar za ovaj korišćenje ovog foruma\u003c/a\u003e. Idite na i \u003ca href=\"http://browsehappy.com\"\u003eobnovite vaš browser\u003c/a\u003e.","permission_types":{"full":"Kreiraj / Odgovori / Vidi","create_post":"Odgovori / Vidi","readonly":"Vidi"},"poll":{"voters":{"one":"glasač","few":"glasača","other":"glasača"},"total_votes":{"one":"ukupan glas","few":"ukupno glasova","other":"ukupno glasova"},"average_rating":"Prosječna ocjena: \u003cstrong\u003e%{average}\u003c/strong\u003e."},"type_to_filter":"kucaj da sortiraš...","admin":{"title":"Revolucionar Admin","moderator":"Moderator","dashboard":{"title":"Dashboard","last_updated":"Dashboard last updated:","version":"Version","up_to_date":"You're up to date!","critical_available":"A critical update is available.","updates_available":"Updates are available.","please_upgrade":"Please upgrade!","no_check_performed":"A check for updates has not been performed. Ensure sidekiq is running.","stale_data":"A check for updates has not been performed lately. Ensure sidekiq is running.","version_check_pending":"Looks like you upgraded recently. Fantastic!","installed_version":"Installed","latest_version":"Najnovije","problems_found":"Problemi su nađeni sa instalacijom Revolucionara:","last_checked":"Zadnje pogledani","refresh_problems":"Osvježi","no_problems":"No problems were found.","moderators":"Moderators:","admins":"Admins:","blocked":"Blocked:","suspended":"Suspended:","private_messages_short":"PP","private_messages_title":"Privatne Poruke","reports":{"today":"Today","yesterday":"Yesterday","last_7_days":"Last 7 Days","last_30_days":"Last 30 Days","all_time":"All Time","7_days_ago":"7 Days Ago","30_days_ago":"30 Days Ago","all":"All","view_table":"View as Table","view_chart":"View as Bar Chart"}},"commits":{"latest_changes":"Latest changes: please update often!","by":"by"},"flags":{"title":"Opomene","old":"Stare","active":"Aktivne","agree":"Slažem se","agree_title":"Confirm this flag as valid and correct","agree_flag_modal_title":"Agree and...","agree_flag_hide_post":"Agree (hide post + send PM)","agree_flag_hide_post_title":"Hide this post and automatically send the user a private message urging them to edit it","agree_flag_restore_post":"Agree (restore post)","agree_flag_restore_post_title":"Restore this post","agree_flag":"Agree with flag","agree_flag_title":"Agree with flag and keep the post unchanged","defer_flag":"Defer","defer_flag_title":"Remove this flag; it requires no action at this time.","delete":"Delete","delete_title":"Delete the post this flag refers to.","delete_post_defer_flag":"Delete post and Defer flag","delete_post_defer_flag_title":"Delete post; if the first post, delete the topic","delete_post_agree_flag":"Delete post and Agree with flag","delete_post_agree_flag_title":"Delete post; if the first post, delete the topic","delete_flag_modal_title":"Delete and...","delete_spammer":"Delete Spammer","delete_spammer_title":"Remove the user and all posts and topics by this user.","disagree_flag_unhide_post":"Disagree (unhide post)","disagree_flag_unhide_post_title":"Remove any flags from this post and make the post visible again","disagree_flag":"Disagree","disagree_flag_title":"Deny this flag as invalid or incorrect","clear_topic_flags":"Done","clear_topic_flags_title":"The topic has been investigated and issues have been resolved. Click Done to remove the flags.","more":"(more replies...)","dispositions":{"agreed":"agreed","disagreed":"disagreed","deferred":"deferred"},"flagged_by":"Flagged by","resolved_by":"Resolved by","took_action":"Took action","system":"System","error":"Something went wrong","reply_message":"Odgovori","no_results":"There are no flags.","topic_flagged":"This \u003cstrong\u003etopic\u003c/strong\u003e has been flagged.","visit_topic":"Visit the topic to take action","was_edited":"Post was edited after the first flag","previous_flags_count":"This post has already been flagged {{count}} times."},"groups":{"primary":"Primary Group","no_primary":"(no primary group)","title":"Groups","edit":"Edit Groups","refresh":"Refresh","new":"New","selector_placeholder":"add users","name_placeholder":"Group name, no spaces, same as username rule","about":"Edit your group membership and names here","group_members":"Group members","delete":"Delete","delete_confirm":"Delete this group?","delete_failed":"Unable to delete group. If this is an automatic group, it cannot be destroyed."},"api":{"generate_master":"Generate Master API Key","none":"There are no active API keys right now.","user":"User","title":"API","key":"API Key","generate":"Generate","regenerate":"Regenerate","revoke":"Revoke","confirm_regen":"Are you sure you want to replace that API Key with a new one?","confirm_revoke":"Are you sure you want to revoke that key?","info_html":"Your API key will allow you to create and update topics using JSON calls.","all_users":"All Users","note_html":"Keep this key \u003cstrong\u003esecret\u003c/strong\u003e, all users that have it may create arbitrary posts as any user."},"backups":{"title":"Backups","menu":{"backups":"Backups","logs":"Logs"},"none":"No backup available.","read_only":{"enable":{"title":"Enable the read-only mode","confirm":"Are you sure you want to enable the read-only mode?"},"disable":{"title":"Disable the read-only mode"}},"logs":{"none":"No logs yet..."},"columns":{"filename":"Filename","size":"Size"},"upload":{"uploading":"Uploading...","success":"'{{filename}}' has successfully been uploaded.","error":"There has been an error while uploading '{{filename}}': {{message}}"},"operations":{"is_running":"An operation is currently running...","failed":"The {{operation}} failed. Please check the logs.","cancel":{"title":"Cancel the current operation","confirm":"Are you sure you want to cancel the current operation?"},"backup":{"title":"Create a backup","confirm":"Do you want to start a new backup?","without_uploads":"Yes (do not include files)"},"download":{"title":"Download the backup"},"destroy":{"title":"Remove the backup","confirm":"Are you sure you want to destroy this backup?"},"restore":{"is_disabled":"Restore is disabled in the site settings.","title":"Restore the backup","confirm":"Are your sure you want to restore this backup?"},"rollback":{"title":"Rollback the database to previous working state","confirm":"Are your sure you want to rollback the database to the previous working state?"}}},"export_csv":{"success":"Export has been initiated, you will be notified shortly with progress.","failed":"Export failed. Please check the logs."},"customize":{"title":"Customize","long_title":"Site Customizations","css":"Stylesheet","header":"Header","override_default":"Do not include standard style sheet","enabled":"Enabled?","preview":"preview","undo_preview":"remove preview","rescue_preview":"default style","explain_preview":"See the site with this custom stylesheet","explain_undo_preview":"Go back to the currently enabled custom stylesheet","explain_rescue_preview":"See the site with the default stylesheet","save":"Save","new":"New","new_style":"New Style","delete":"Delete","delete_confirm":"Delete this customization?","about":"Modify CSS stylesheets and HTML headers on the site. Add a customization to start.","color":"Color","opacity":"Opacity","copy":"Copy","css_html":{"title":"CSS/HTML","long_title":"CSS and HTML Customizations"},"colors":{"title":"Colors","long_title":"Color Schemes","about":"Modify the colors used on the site without writing CSS. Add a scheme to start.","new_name":"New Color Scheme","copy_name_prefix":"Copy of","delete_confirm":"Delete this color scheme?","undo":"undo","undo_title":"Undo your changes to this color since the last time it was saved.","revert":"revert","revert_title":"Reset this color to Discourse's default color scheme.","primary":{"name":"primary","description":"Most text, icons, and borders."},"secondary":{"name":"secondary","description":"The main background color, and text color of some buttons."},"tertiary":{"name":"tertiary","description":"Links, some buttons, notifications, and accent color."},"quaternary":{"name":"quaternary","description":"Navigation links."},"header_background":{"name":"header background","description":"Background color of the site's header."},"header_primary":{"name":"header primary","description":"Text and icons in the site's header."},"highlight":{"name":"highlight","description":"The background color of highlighted elements on the page, such as posts and topics."},"danger":{"name":"danger","description":"Highlight color for actions like deleting posts and topics."},"success":{"name":"success","description":"Used to indicate an action was successful."},"love":{"name":"love","description":"The like button's color."},"wiki":{"name":"wiki","description":"Base color used for the background of wiki posts."}}},"email":{"title":"Email","settings":"Settings","all":"All","sending_test":"Sending test Email...","test_error":"There was a problem sending the test email. Please double-check your mail settings, verify that your host is not blocking mail connections, and try again.","sent":"Sent","skipped":"Skipped","sent_at":"Sent At","time":"Time","user":"User","email_type":"Email Type","to_address":"To Address","test_email_address":"email address to test","send_test":"Send Test Email","sent_test":"sent!","delivery_method":"Delivery Method","preview_digest":"Pregled Sajta","refresh":"Refresh","format":"Format","html":"html","text":"text","last_seen_user":"Last Seen User:","reply_key":"Reply Key","skipped_reason":"Skip Reason","logs":{"none":"No logs found.","filters":{"title":"Filter","user_placeholder":"username","address_placeholder":"name@example.com","type_placeholder":"digest, signup...","reply_key_placeholder":"reply key","skipped_reason_placeholder":"reason"}}},"logs":{"title":"Logs","action":"Action","created_at":"Created","last_match_at":"Last Matched","match_count":"Matches","ip_address":"IP","topic_id":"Topic ID","post_id":"Post ID","delete":"Delete","edit":"Edit","save":"Save","screened_actions":{"block":"block","do_nothing":"do nothing"},"staff_actions":{"title":"Staff Actions","instructions":"Click usernames and actions to filter the list. Click avatars to go to user pages.","clear_filters":"Show Everything","staff_user":"Staff User","target_user":"Target User","subject":"Subject","when":"When","context":"Context","details":"Details","previous_value":"Previous","new_value":"New","diff":"Diff","show":"Show","modal_title":"Details","no_previous":"There is no previous value.","deleted":"No new value. The record was deleted.","actions":{"delete_user":"delete user","change_trust_level":"change trust level","change_site_setting":"change site setting","change_site_customization":"change site customization","delete_site_customization":"delete site customization","suspend_user":"suspend user","unsuspend_user":"unsuspend user","grant_badge":"grant badge","revoke_badge":"revoke badge","check_email":"check email","delete_topic":"delete topic","delete_post":"delete post"}},"screened_emails":{"title":"Screened Emails","description":"When someone tries to create a new account, the following email addresses will be checked and the registration will be blocked, or some other action performed.","email":"Email Address","actions":{"allow":"Allow"}},"screened_urls":{"title":"Screened URLs","description":"The URLs listed here were used in posts by users who have been identified as spammers.","url":"URL","domain":"Domain"},"screened_ips":{"title":"Screened IPs","description":"IP addresses that are being watched. Use \"Allow\" to whitelist IP addresses.","delete_confirm":"Are you sure you want to remove the rule for %{ip_address}?","actions":{"block":"Block","do_nothing":"Allow","allow_admin":"Allow Admin"},"form":{"label":"New:","ip_address":"IP address","add":"Add"}},"logster":{"title":"Error Logs"}},"impersonate":{"title":"Impersonate","help":"Use this tool to impersonate a user account for debugging purposes. You will have to log out once finished."},"users":{"title":"Users","create":"Add Admin User","last_emailed":"Last Emailed","not_found":"Sorry, that username doesn't exist in our system.","active":"Active","nav":{"new":"Novi","active":"Active","pending":"Pending","suspended":"Suspended","blocked":"Blocked"},"approved":"Approved?","titles":{"active":"Active Users","new":"New Users","pending":"Users Pending Review","newuser":"Users at Trust Level 0 (New User)","basic":"Users at Trust Level 1 (Basic User)","admins":"Admin Users","moderators":"Moderators","blocked":"Blocked Users","suspended":"Suspended Users"},"not_verified":"Not verified","check_email":{"title":"Reveal this user's email address","text":"Show"}},"user":{"suspend_failed":"Something went wrong suspending this user {{error}}","unsuspend_failed":"Something went wrong unsuspending this user {{error}}","suspend_duration":"How long will the user be suspended for?","suspend_duration_units":"(days)","suspend_reason_label":"Why are you suspending? This text \u003cb\u003ewill be visible to everyone\u003c/b\u003e on this user's profile page, and will be shown to the user when they try to log in. Keep it short.","suspend_reason":"Reason","suspended_by":"Suspended by","delete_all_posts":"Delete all posts","delete_all_posts_confirm":"You are about to delete %{posts} posts and %{topics} topics. Are you sure?","suspend":"Suspend","unsuspend":"Unsuspend","suspended":"Suspended?","moderator":"Moderator?","admin":"Admin?","blocked":"Blocked?","show_admin_profile":"Admin","edit_title":"Edit Title","save_title":"Save Title","refresh_browsers":"Force browser refresh","refresh_browsers_message":"Message sent to all clients!","show_public_profile":"Show Public Profile","impersonate":"Impersonate","ip_lookup":"IP Lookup","log_out":"Log Out","logged_out":"User was logged out on all devices","revoke_admin":"Revoke Admin","grant_admin":"Grant Admin","revoke_moderation":"Revoke Moderation","grant_moderation":"Grant Moderation","unblock":"Unblock","block":"Block","reputation":"Reputation","permissions":"Permissions","activity":"Activity","like_count":"Likes Given / Received","last_100_days":"in the last 100 days","private_topics_count":"Private Topics","posts_read_count":"Posts Read","post_count":"Posts Created","topics_entered":"Topics Viewed","flags_given_count":"Flags Given","flags_received_count":"Flags Received","warnings_received_count":"Warnings Received","flags_given_received_count":"Flags Given / Received","approve":"Approve","approved_by":"approved by","approve_success":"User approved and email sent with activation instructions.","approve_bulk_success":"Success! All selected users have been approved and notified.","time_read":"Read Time","delete":"Delete User","delete_forbidden_because_staff":"Admins and moderators can't be deleted.","delete_confirm":"Are you SURE you want to delete this user? This is permanent!","delete_and_block":"Delete and \u003cb\u003eblock\u003c/b\u003e this email and IP address","delete_dont_block":"Delete only","deleted":"The user was deleted.","delete_failed":"There was an error deleting that user. Make sure all posts are deleted before trying to delete the user.","send_activation_email":"Send Activation Email","activation_email_sent":"An activation email has been sent.","send_activation_email_failed":"There was a problem sending another activation email. %{error}","activate":"Activate Account","activate_failed":"There was a problem activating the user.","deactivate_account":"Deactivate Account","deactivate_failed":"There was a problem deactivating the user.","unblock_failed":"There was a problem unblocking the user.","block_failed":"There was a problem blocking the user.","deactivate_explanation":"A deactivated user must re-validate their email.","suspended_explanation":"A suspended user can't log in.","block_explanation":"A blocked user can't post or start topics.","trust_level_change_failed":"There was a problem changing the user's trust level.","suspend_modal_title":"Suspend User","trust_level_2_users":"Trust Level 2 Users","trust_level_3_requirements":"Trust Level 3 Requirements","trust_level_locked_tip":"trust level is locked, system will not promote or demote user","trust_level_unlocked_tip":"trust level is unlocked, system will may promote or demote user","lock_trust_level":"Lock Trust Level","unlock_trust_level":"Unlock Trust Level","tl3_requirements":{"title":"Requirements for Trust Level 3","table_title":"In the last 100 days:","value_heading":"Value","requirement_heading":"Requirement","visits":"Visits","days":"days","topics_replied_to":"Topics Replied To","topics_viewed":"Topics Viewed","topics_viewed_all_time":"Topics Viewed (all time)","posts_read":"Posts Read","posts_read_all_time":"Posts Read (all time)","flagged_posts":"Flagged Posts","flagged_by_users":"Users Who Flagged","likes_given":"Likes Given","likes_received":"Likes Received","likes_received_days":"Likes Received: unique days","likes_received_users":"Likes Received: unique users","qualifies":"Qualifies for trust level 3.","does_not_qualify":"Doesn't qualify for trust level 3.","will_be_promoted":"Will be promoted soon.","will_be_demoted":"Will be demoted soon.","on_grace_period":"Currently in promotion grace period, will not be demoted.","locked_will_not_be_promoted":"Trust level locked. Will never be promoted.","locked_will_not_be_demoted":"Trust level locked. Will never be demoted."},"sso":{"title":"Single Sign On","external_id":"External ID","external_username":"Nadimak","external_name":"Ime","external_email":"Email","external_avatar_url":"Avatar URL"}},"user_fields":{"title":"User Fields","help":"Add fields that your users can fill out.","create":"Create User Field","untitled":"Untitled","name":"Field Name","type":"Field Type","description":"Field Description","save":"Save","edit":"Edit","delete":"Delete","cancel":"Cancel","delete_confirm":"Are you sure you want to delete that user field?","required":{"title":"Required at signup?","enabled":"required","disabled":"not required"},"editable":{"title":"Editable after signup?","enabled":"editable","disabled":"not editable"},"field_types":{"text":"Text Field","confirm":"Confirmation"}},"site_text":{"none":"Choose a type of content to begin editing.","title":"Text Content"},"site_settings":{"show_overriden":"Only show overridden","title":"Settings","reset":"reset","none":"none","no_results":"No results found.","clear_filter":"Clear","categories":{"all_results":"All","required":"Required","basic":"Basic Setup","users":"Users","posting":"Posting","email":"Email","files":"Files","trust":"Trust Levels","security":"Security","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Rate Limits","developer":"Developer","embedding":"Embedding","legal":"Legal","uncategorized":"Other","backups":"Backups","login":"Login"}},"badges":{"title":"Bedž","new_badge":"Novi Bedž","new":"Novo","name":"Ime","badge":"Bedž","display_name":"Prikazano Ime","description":"Opis","badge_type":"Bedž Tip","badge_grouping":"Grupa","badge_groupings":{"modal_title":"Grupiranje bedževa"},"granted_by":"Dat od","granted_at":"Dato na","save":"Sačuvaj","delete":"Obriši","delete_confirm":"Are you sure you want to delete this badge?","revoke":"Revoke","revoke_confirm":"Are you sure you want to revoke this badge?","edit_badges":"Edit Badges","grant_badge":"Grant Badge","granted_badges":"Granted Badges","grant":"Grant","no_user_badges":"%{name} has not been granted any badges.","no_badges":"There are no badges that can be granted.","allow_title":"Allow badge to be used as a title","multiple_grant":"Can be granted multiple times","listable":"Show badge on the public badges page","enabled":"Enable badge","icon":"Icon","query":"Badge Query (SQL)","target_posts":"Query targets posts","auto_revoke":"Run revocation query daily","show_posts":"Show post granting badge on badge page","trigger":"Trigger","trigger_type":{"none":"Update daily","post_action":"When a user acts on post","post_revision":"When a user edits or creates a post","trust_level_change":"When a user changes trust level","user_change":"When a user is edited or created"},"preview":{"link_text":"Preview granted badges","plan_text":"Preview with query plan","modal_title":"Badge Query Preview","sql_error_header":"There was an error with the query.","error_help":"See the following links for help with badge queries.","bad_count_warning":{"header":"WARNING!","text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"sample":"Sample:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link} at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}}},"lightbox":{"download":"skini"},"keyboard_shortcuts_help":{"title":"Prečice na Tastaturi","jump_to":{"title":"Skoči na","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Home (Najnovije)","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Najnovije","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nove Teme","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Nepročitane","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategorije","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Popularne"},"navigation":{"title":"Navigacija","jump":"\u003cb\u003e#\u003c/b\u003e Idi na post #","back":"\u003cb\u003eu\u003c/b\u003e Nazad","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Move selection \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e Open selected topic","next_prev":"\u003cb\u003eshift j\u003c/b\u003e/\u003cb\u003eshift k\u003c/b\u003e Next/previous section"},"application":{"title":"Aplikacija","create":"\u003cb\u003ec\u003c/b\u003e Započni novu temu","notifications":"\u003cb\u003en\u003c/b\u003e Otvori notifikacije","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Otvori meni korisnika","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Pročitaj promjenje teme","search":"\u003cb\u003e/\u003c/b\u003e Tragaj","help":"\u003cb\u003e?\u003c/b\u003e Otvori pomoć za tastaturu","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Dismiss New/Posts","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Dismiss Topics"},"actions":{"title":"Akcije","share_topic":"\u003cb\u003eshift s\u003c/b\u003e Sheruj temu","share_post":"\u003cb\u003es\u003c/b\u003e Sheruj post","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Odgovori kroz novu temu","reply_topic":"\u003cb\u003eshift r\u003c/b\u003e Odgovori na Temu","reply_post":"\u003cb\u003er\u003c/b\u003e Odgovori na post","quote_post":"\u003cb\u003eq\u003c/b\u003e Citiraj odgovor","like":"\u003cb\u003el\u003c/b\u003e Lajkuj post","flag":"\u003cb\u003e!\u003c/b\u003e Opomeni post","bookmark":"\u003cb\u003eb\u003c/b\u003e Bookmark post","edit":"\u003cb\u003ee\u003c/b\u003e Izmjeni post","delete":"\u003cb\u003ed\u003c/b\u003e Obriši post","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mutiraj temu","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Regularna tema","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Prati temu","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Motri temu"}},"badges":{"title":"Bedževi","allow_title":"allow badge as title?","multiple_grant":"awarded multiple times?","select_badge_for_title":"Izaveri bedž za svoj naslov","none":"\u003cnijedna\u003e","badge_grouping":{"getting_started":{"name":"Da započnete"},"community":{"name":"Zajednica"},"trust_level":{"name":"Nivo Povjerenja"},"other":{"name":"Drugi"},"posting":{"name":"Postiranje"}},"badge":{"editor":{"name":"Urednik","description":"Prvi post izmjenjen"},"basic_user":{"name":"Osnovni","description":"\u003ca href=\"https://revolucionar.com/t/what-do-user-trust-levels-do/4924/4\"\u003eOdobrene\u003c/a\u003e sve osnovne funkcije foruma"},"member":{"name":"Član","description":"\u003ca href=\"https://revolucionar.com/t/what-do-user-trust-levels-do/4924/5\"\u003eOdobrene\u003c/a\u003e pozivnice"},"regular":{"name":"Regularan","description":"\u003ca href=\"https://revolucionar.com/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"leader":{"name":"Vođa","description":"\u003ca href=\"https://revolucionar.com/t/what-do-user-trust-levels-do/4924/7\"\u003eGranted\u003c/a\u003e global edit, pin, close, archive, split and merge"},"welcome":{"name":"Dobrodošao","description":"Dobio Lajk"},"autobiographer":{"name":"Autobiografičar","description":"Popunio biografiju na svom \u003ca href=\"/my/preferences\"\u003eprofilu\u003c/a\u003e"},"anniversary":{"name":"Godišnjica","description":"Aktivan član godinu dana, pisao najmanje jednom"},"nice_post":{"name":"Dobar Post","description":"Dobio 10 lajkova na postu. Ovaj se bedž može dobiti više puta"},"good_post":{"name":"Odličan Post","description":"Dobio 25 lajkova na postu. Ovaj se bedž može dobiti više puta"},"great_post":{"name":"Super Post","description":"Dobio 50 lajkova na postu. Ovaj se bedž može dobiti više puta"},"nice_topic":{"name":"Dobra Tema","description":"Dobio 10 lajkova na postu. Ovaj se bedž može dobiti više puta"},"good_topic":{"name":"Odlična Tema","description":"Dobio 25 lajkova na postu. Ovaj se bedž može dobiti više puta"},"great_topic":{"name":"Super Tema","description":"Dobio 50 lajkova na postu. Ovaj se bedž može dobiti više puta"},"nice_share":{"name":"Dobar Share","description":"Podijelio je post sa više od 25 posjetilaca"},"good_share":{"name":"Good Share","description":"Shared a post with 300 unique visitors"},"great_share":{"name":"Great Share","description":"Shared a post with 1000 unique visitors"},"first_like":{"name":"Prvi Lajk","description":"Lajkovao post"},"first_flag":{"name":"Prva Opomena","description":"Opomenuo post"},"champion":{"description":"Pozvao 5 članova (trust level 2)"},"first_share":{"name":"Prvi Share","description":"Podijelio post"},"first_link":{"name":"Prvi Link","description":"Dodao interni link na drugu temu"},"first_quote":{"name":"Prvo Citiranje","description":"Citirao korisnika"},"read_guidelines":{"name":"Pročitao Pravila","description":"Pročitao \u003ca href=\"/guidelines\"\u003enaša pravila\u003c/a\u003e"},"reader":{"name":"Čitač","description":"Pročitao post na temi sa više od 100 postova"}}}}},"en":{"js":{"dates":{"full_no_year_no_time":"MMMM Do","full_with_year_no_time":"MMMM Do, YYYY","tiny":{"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}h"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1y","other":"%{count}y"},"over_x_years":{"one":"\u003e 1y","other":"\u003e %{count}y"},"almost_x_years":{"one":"1y","other":"%{count}y"}}},"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"emails_are_disabled":"All outgoing email has been globally disabled by an administrator. No email notifications of any kind will be sent.","show_help":"options","uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","directory":{"filter_name":"filter by username","likes_given":"Given","likes_received":"Received","topics_entered":"Entered","topics_entered_long":"Topics Entered","time_read":"Time Read","topic_count_long":"Topics Created","post_count_long":"Replies Posted","no_results":"No results were found.","days_visited_long":"Days Visited","posts_read":"Read","posts_read_long":"Posts Read"},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"user_action_groups":{"14":"Pending"},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"},"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}.","other":"%{count} new topics in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}.","other":"%{count} new posts in the past %{unit}."}},"ip_lookup":{"delete_other_accounts":"Delete %{count}","username":"username","trust_level":"TL","read_time":"read time","topics_entered":"topics entered","post_count":"# posts","confirm_delete_other_accounts":"Are you sure you want to delete these accounts?"},"user_fields":{"none":"(select an option)"},"user":{"new_private_message":"New Message","expand_profile":"Expand","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_default":"Turn On Notifications","perm_denied_btn":"Permission Denied","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","disable":"Disable Notifications","currently_enabled":"(currently enabled)","enable":"Enable Notifications","currently_disabled":"(currently disabled)","each_browser_note":"Note: You have to change this setting on every browser you use."},"dismiss_notifications":"Mark all as Read","dismiss_notifications_tooltip":"Mark all unread notifications as read","blocked_tooltip":"This user is blocked","github_profile":"Github","watched_categories_instructions":"You will automatically watch all new topics in these categories. You will be notified of all new posts and topics, and a count of new posts will also appear next to the topic.","tracked_categories_instructions":"You will automatically track all new topics in these categories. A count of new posts will appear next to the topic.","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","admin_delete":"Delete","users":"Users","muted_users":"Muted","muted_users_instructions":"Suppress all notifications from these users.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_about":{"error":"There was an error changing ths value."},"change_avatar":{"gravatar_title":"Change your avatar on Gravatar's website","cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"change_profile_background":{"instructions":"Profile backgrounds will be centered and have a default width of 850px."},"change_card_background":{"title":"User Card Background","instructions":"Background images will be centered and have a default width of 590px."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"name":{"instructions_required":"Your full name"},"card_badge":{"title":"User Card Badge"},"email_digests":{"every_three_days":"every three days","every_two_weeks":"every two weeks"},"email_always":"Send me email notifications even when I am active on the site","new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"immediately":"immediately","after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab":"Redeemed","redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab":"Pending","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"},"password":{"same_as_username":"Your password is the same as your username.","same_as_email":"Your password is the same as your email."},"avatar":{"header_title":"profile, messages, bookmarks and preferences"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"logout":"You were logged out.","refresh":"Refresh","too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","last_reply_lowercase":"last reply","replies_lowercase":{"one":"reply","other":"replies"},"signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"login":{"rate_limit":"Please wait before trying to log in again.","admin_not_allowed_from_ip_address":"You can't log in as admin from that IP address.","to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","error":{"try_like":"Have you tried the \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e button?"},"reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"},"popup":{"mentioned":"{{username}} mentioned you in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} quoted you in \"{{topic}}\" - {{site_title}}","replied":"{{username}} replied to you in \"{{topic}}\" - {{site_title}}","posted":"{{username}} posted in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sent you a private message in \"{{topic}}\" - {{site_title}}","linked":"{{username}} linked to your post from \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip":"select images from your device","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor","select_file":"Select File"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"no_more_results":"No more results found.","search_help":"Search help","context":{"private_messages":"Search messages"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again","choose_new_category":"Choose the new category for the topics:","selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic.","other":"You have selected \u003cb\u003e{{count}}\u003c/b\u003e topics."}},"none":{"bookmarks":"You have no bookmarked topics yet.","search":"There are no search results."},"bottom":{"bookmarks":"There are no more bookmarked topics.","search":"There are no more search results."}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"new_topics":{"one":"1 new topic","other":"{{count}} new topics"},"unread_topics":{"one":"1 unread topic","other":"{{count}} unread topics"},"total_unread_posts":{"one":"you have 1 unread post in this topic","other":"you have {{count}} unread posts in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic","other":"you have {{count}} unread old posts in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it","other":"there are {{count}} new posts in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic","other":"there are {{count}} likes in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","progress":{"jump_bottom":"jump to last post"},"notifications":{"watching_pm":{"description":"You will be notified of every new reply in this message, and a count of new replies will be shown."},"watching":{"description":"You will be notified of every new reply in this topic, and a count of new replies will be shown."},"tracking_pm":{"description":"A count of new replies will be shown for this message. You will be notified if someone mentions your @name or replies to you."},"tracking":{"description":"A count of new replies will be shown for this topic. You will be notified if someone mentions your @name or replies to you. "},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature":{"pin_globally":"Pin Topic Globally","make_banner":"Banner Topic","remove_banner":"Remove Banner Topic"},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","confirm_pin":"You already have {{count}} pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic in this category?","unpin":"Remove this topic from the top of the {{categoryLink}} category.","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Users can unpin the topic individually for themselves.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","confirm_pin_globally":"You already have {{count}} globally pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic globally?","unpin_globally":"Remove this topic from the top of all topic lists.","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Users can unpin the topic individually for themselves.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Make this topic into a banner that appears at the top of all pages.","remove_banner":"Remove the banner that appears at the top of all pages.","banner_note":"Users can dismiss the banner by closing it. Only one topic can be bannered at any given time.","no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","invite_reply":{"username_placeholder":"username","sso_enabled":"Enter the username of the person you'd like to invite to this topic.","to_topic_blank":"Enter the username or email address of the person you'd like to invite to this topic.","to_topic_email":"You've entered an email address. We'll email an invitation that allows your friend to immediately reply to this topic.","to_topic_username":"You've entered a username. We'll send a notification with a link inviting them to this topic.","to_username":"Enter the username of the person you'd like to invite. We'll send a notification with a link inviting them to this topic.","success_email":"We mailed out an invitation to \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. We'll notify you when the invitation is redeemed. Check the invitations tab on your user page to keep track of your invites.","success_username":"We've invited that user to participate in this topic."},"filters":{"n_posts":{"one":"1 post","other":"{{count}} posts"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected.","other":"You are about to create a new topic and populate it with the \u003cb\u003e{{count}}\u003c/b\u003e posts you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to.","other":"Please choose the topic you'd like to move those \u003cb\u003e{{count}}\u003c/b\u003e posts to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Please choose the new owner of the {{count}} posts by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post.","other":"You have selected \u003cb\u003e{{count}}\u003c/b\u003e posts."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)","other":"(post withdrawn by author, will be automatically deleted in %{count} hours unless flagged)"},"gap":{"one":"view 1 hidden reply","other":"view {{count}} hidden replies"},"has_replies":{"one":"{{count}} Reply","other":"{{count}} Replies"},"has_likes":{"one":"{{count}} Like","other":"{{count}} Likes"},"has_likes_title":{"one":"1 person liked this post","other":"{{count}} people liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"errors":{"too_many_dragged_and_dropped_files":"Sorry, you can only drag \u0026 drop up to 10 files at a time."},"whisper":"this post is a private whisper for moderators","controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?","other":"Do you also want to delete the {{count}} direct replies to this post?"}},"change_owner":"Change Ownership"},"actions":{"defer_flags":{"one":"Defer flag","other":"Defer flags"},"people":{"spam_with_url":"{{icons}} flagged \u003ca href='{{postUrl}}'\u003ethis as spam\u003c/a\u003e"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic","other":"You and {{count}} other people flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam","other":"You and {{count}} other people flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate","other":"You and {{count}} other people flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation","other":"You and {{count}} other people flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user","other":"You and {{count}} other people sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post","other":"You and {{count}} other people bookmarked this post"},"like":{"one":"You and 1 other liked this","other":"You and {{count}} other people liked this"},"vote":{"one":"You and 1 other voted for this post","other":"You and {{count}} other people voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic","other":"{{count}} people flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam","other":"{{count}} people flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate","other":"{{count}} people flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation","other":"{{count}} people flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user","other":"{{count}} sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post","other":"{{count}} people bookmarked this post"},"like":{"one":"1 person liked this","other":"{{count}} people liked this"},"vote":{"one":"1 person voted for this post","other":"{{count}} people voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?","other":"Are you sure you want to delete all those posts?"}},"revisions":{"controls":{"comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"}}},"category":{"all":"All categories","topic_template":"Topic Template","create_long":"Create a new category","slug":"Category Slug","slug_placeholder":"(Optional) dashed-words for url","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"private_reminder":"flags are private, \u003cb\u003eonly\u003c/b\u003e visible to staff","notify_staff":"Notify Staff","formatted_name":{"off_topic":"It's Off-Topic","inappropriate":"It's Inappropriate","spam":"It's Spam"}},"topic_map":{"participants_title":"Frequent Posters","links_title":"Popular Links","clicks":{"one":"1 click","other":"%{count} clicks"}},"topic_statuses":{"bookmarked":{"help":"You bookmarked this topic"},"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"views_lowercase":{"one":"view","other":"views"},"likes_lowercase":{"one":"like","other":"likes"},"users_lowercase":{"one":"user","other":"users"},"raw_email":{"title":"Raw Email","not_available":"Not available!"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"search":{"title":"Search","help":"search all topics"},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"bookmarks":{"title":"Bookmarks","help":"topics you have bookmarked"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"all":{"title":"All Time"},"quarterly":{"title":"Quarterly"},"all_time":"All Time","this_year":"Year","this_quarter":"Quarter","this_month":"Month","this_week":"Week","other_periods":"see top"}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"between_min_and_max_options":"You may choose between \u003cstrong\u003e%{min}\u003c/strong\u003e and \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"cast-votes":{"title":"Cast your votes","label":"Vote now!"},"show-results":{"title":"Display the poll results","label":"Show results"},"hide-results":{"title":"Back to your votes","label":"Hide results"},"open":{"title":"Open the poll","label":"Open","confirm":"Are you sure you want to open this poll?"},"close":{"title":"Close the poll","label":"Close","confirm":"Are you sure you want to close this poll?"},"error_while_toggling_status":"There was an error while toggling the status of this poll.","error_while_casting_votes":"There was an error while casting your votes."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"dashboard":{"mobile_title":"Mobile","space_free":"{{size}} free","uploads":"uploads","backups":"backups","traffic_short":"Traffic","traffic":"Application web requests","page_views":"API Requests","page_views_short":"API Requests","show_traffic_report":"Show Detailed Traffic Report","reports":{"refresh_report":"Refresh Report","start_date":"Start Date","end_date":"End Date"}},"flags":{"summary":{"action_type_3":{"one":"off-topic","other":"off-topic x{{count}}"},"action_type_4":{"one":"inappropriate","other":"inappropriate x{{count}}"},"action_type_6":{"one":"custom","other":"custom x{{count}}"},"action_type_7":{"one":"custom","other":"custom x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"delete_member_confirm":"Remove '%{username}' from the '%{group}' group?","delete_owner_confirm":"Remove owner privilege for '%{username}'?","name":"Name","add":"Add","add_members":"Add members","custom":"Custom","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","automatic":"Automatic","automatic_membership_email_domains":"Users who register with an email domain that exactly matches one in this list will be automatically added to this group:","automatic_membership_retroactive":"Apply the same email domain rule to add existing registered users","default_title":"Default title for all users in this group","primary_group":"Automatically set as primary group","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"plugins":{"title":"Plugins","installed":"Installed Plugins","name":"Name","none_installed":"You don't have any plugins installed.","version":"Version","enabled":"Enabled?","is_enabled":"Y","not_enabled":"N","change_settings":"Change Settings","change_settings_short":"Settings","howto":"How do I install plugins?"},"backups":{"read_only":{"enable":{"label":"Enable read-only mode"},"disable":{"label":"Disable read-only mode"}},"upload":{"label":"Upload","title":"Upload a backup to this instance"},"operations":{"cancel":{"label":"Cancel"},"backup":{"label":"Backup"},"download":{"label":"Download"},"restore":{"label":"Restore"},"rollback":{"label":"Rollback"}}},"export_csv":{"user_archive_confirm":"Are you sure you want to download your posts?","rate_limit_error":"Posts can be downloaded once per day, please try again tomorrow.","button_text":"Export","button_title":{"user":"Export full user list in CSV format.","staff_action":"Export full staff action log in CSV format.","screened_email":"Export full screened email list in CSV format.","screened_ip":"Export full screened IP list in CSV format.","screened_url":"Export full screened URL list in CSV format."}},"export_json":{"button_text":"Export"},"invite":{"button_text":"Send Invites","button_title":"Send Invites"},"customize":{"top":"Top","footer":"Footer","embedded_css":"Embedded CSS","head_tag":{"text":"\u003c/head\u003e","title":"HTML that will be inserted before the \u003c/head\u003e tag"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML that will be inserted before the \u003c/body\u003e tag"},"import":"Import","import_title":"Select a file or paste text","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"error":"\u003cb\u003eERROR\u003c/b\u003e - %{server_error}","preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"change_username":"change username","impersonate":"impersonate","anonymize_user":"anonymize user","roll_up":"roll up IP blocks","change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}},"screened_ips":{"roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?","rolled_up_some_subnets":"Successfully rolled up IP ban entries to these subnets: %{subnets}.","rolled_up_no_subnet":"There was nothing to roll up.","form":{"filter":"Search"},"roll_up":{"text":"Roll up","title":"Creates new subnet ban entries if there are at least 'min_ban_entries_for_roll_up' entries."}}},"impersonate":{"not_found":"That user can't be found.","invalid":"Sorry, you may not impersonate that user."},"users":{"id_not_found":"Sorry, that user id doesn't exist in our system.","show_emails":"Show Emails","nav":{"staff":"Staff","suspect":"Suspect"},"approved_selected":{"one":"approve user","other":"approve users ({{count}})"},"reject_selected":{"one":"reject user","other":"reject users ({{count}})"},"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)","staff":"Staff","suspect":"Suspect Users"},"reject_successful":{"one":"Successfully rejected 1 user.","other":"Successfully rejected %{count} users."},"reject_failures":{"one":"Failed to reject 1 user.","other":"Failed to reject %{count} users."}},"user":{"anonymize":"Anonymize User","anonymize_confirm":"Are you SURE you want to anonymize this account? This will change the username and email, and reset all profile information.","anonymize_yes":"Yes, anonymize this account","anonymize_failed":"There was a problem anonymizing the account.","delete_posts_forbidden_because_staff":"Can't delete all posts of admins and moderators.","delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)","other":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} days old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)","other":"Can't delete all posts. Some posts are older than %{count} days old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)","other":"Can't delete all posts because the user has more than %{count} posts.  (delete_all_posts_max)"}},"user_fields":{"options":"Options","show_on_profile":{"title":"Show on public profile?","enabled":"shown on profile","disabled":"not shown on profile"},"field_types":{"dropdown":"Dropdown"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"add_url":"add URL","add_host":"add host","categories":{"plugins":"Plugins","user_preferences":"User Preferences"}},"badges":{"reason_help":"(A link to a post or topic)","reason":"Reason","expand":"Expand \u0026hellip;","none_selected":"Select a badge to get started","image":"Image","icon_help":"Use either a Font Awesome class or URL to an image","preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"emoji":{"title":"Emoji","help":"Add new emoji that will be available to everyone. (PROTIP: drag \u0026 drop multiple files at once)","add":"Add New Emoji","name":"Name","image":"Image","delete_confirm":"Are you sure you want to delete the :%{name}: emoji?"},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","add":"Add","filter":"Search (URL or External URL)"}}},"search_help":{"title":"Search Help"},"keyboard_shortcuts_help":{"jump_to":{"bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Bookmarks","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"},"actions":{"bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Toggle bookmark topic","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Pin/Unpin topic"}},"badges":{"badge_count":{"one":"1 Badge","other":"%{count} Badges"},"more_badges":{"one":"+1 More","other":"+%{count} More"},"granted":{"one":"1 granted","other":"%{count} granted"},"badge":{"promoter":{"name":"Promoter","description":"Invited a user"},"campaigner":{"name":"Campaigner","description":"Invited 3 basic users (trust level 1)"},"champion":{"name":"Champion"},"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'bs_BA';
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
