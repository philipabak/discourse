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
MessageFormat.locale.te = function ( n ) {
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
    })({});I18n.translations = {"te":{"js":{"number":{"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"బైటు","other":"బైట్లు"},"gb":"జీబీ","kb":"కేబీ","mb":"యంబీ","tb":"టీబీ"}}}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1ని","less_than_x_seconds":{"one":"\u003c 1సె","other":"\u003c %{count}సె"},"x_seconds":{"one":"1సె","other":"%{count}సె"},"less_than_x_minutes":{"one":"\u003c 1ని","other":"\u003c %{count}ని"},"x_minutes":{"one":"1ని","other":"%{count}ని"},"about_x_hours":{"one":"1గ","other":"%{count}గం"},"x_days":{"one":"1రో","other":"%{count}రో"},"about_x_years":{"one":"1సం","other":"%{count}సం"},"over_x_years":{"one":"\u003e 1సం","other":"\u003e %{count}సం"},"almost_x_years":{"one":"1సం","other":"%{count}సం"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 నిమిషం","other":"%{count} నిమిషాలు"},"x_hours":{"one":"1 గంట","other":"%{count} గంటలు"},"x_days":{"one":"1 రోజు","other":"%{count} రోజులు"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"one":"1 నిమిషం ముందు","other":"%{count} నిమిషాలు ముందు"},"x_hours":{"one":"1 గంట క్రితం","other":"%{count} గంటల ముందు"},"x_days":{"one":"1 రోజు ముందు","other":"%{count} రోజుల ముందు"}}},"share":{"topic":"ఈ విషయానికి ఒక లంకెను పంచండి","post":"#%{postNumber} టపా","close":"మూసివేయి","twitter":"ట్విట్టరుపై లంకెను పంచు","facebook":"ఫేస్ బుక్ పై లంకెను పంచు","google+":"గూగుల్ ప్లస్ పై లంకెను పంచు","email":"ఈ లంకెను ఈమెయిల్ ద్వారా పంచు"},"topic_admin_menu":"విషయపు అధికార చర్యలు","emails_are_disabled":"బయటకు వెళ్లే అన్ని ఈమెయిల్లూ అధికారి నిశేధించాడు. ఇప్పుడు ఎటువంటి ఈమెయిల్ ప్రకటనలూ పంపవీలవదు.","edit":"ఈ విషయపు శీర్షిక మరియు వర్గం సవరించు","not_implemented":"ఈ ఫీచరు ఇంకా ఇంప్లిమెటు చేయలేదు. క్షమాపణలు!","no_value":"లేదు","yes_value":"అవును","generic_error":"క్షమించాలి, ఒక దోషం తలెత్తింది","generic_error_with_reason":"ఒక దోషం జరిగింది: %{error}","sign_up":"సైన్ అప్","log_in":"లాగిన్","age":"వయసు","joined":"చేరినారు","admin_title":"అధికారి","flags_title":"కేతనాలు","show_more":"మరింత చూపు","links":"లంకెలు","links_lowercase":{"one":"లంకె","other":"లంకెలు"},"faq":"తవసం","guidelines":"మార్గదర్శకాలు","privacy_policy":"అంతరంగికతా విధానం","privacy":"అంతరంగికత","terms_of_service":"సేవా నిబంధనలు ","mobile_view":"చర సందర్శనం","desktop_view":"డెస్క్ టాప్ సందర్శనం","you":"మీరు","or":"లేదా","now":"ఇప్పుడే","read_more":"మరింత చదువు","more":"మరింత","less":"తక్కువ","never":"ఎప్పటికీ వద్దు","daily":"ప్రతిరోజూ","weekly":"ప్రతీవారం","every_two_weeks":"రెండువారాలకోసారి","every_three_days":"ప్రతి మూడు రోజులకీ","max_of_count":"{{count}} గరిష్టం","character_count":{"one":"{{count}} అక్షరం","other":"{{count}} అక్షరాలు"},"suggested_topics":{"title":"సూచించే విషయాలు"},"about":{"simple_title":"గురించి","title":"%{title} గురించి","stats":"సైటు గణాంకాలు","our_admins":"మా అధికారులు","our_moderators":"మా నిర్వాహకులు","stat":{"all_time":"ఆల్ టైమ్","last_7_days":"గత ఏడు రోజులు","last_30_days":"గత 30 రోజులు"},"like_count":"ఇష్టాలు","topic_count":"విషయాలు","post_count":"టపాలు","user_count":"కొత్త సభ్యులు","active_user_count":"క్రియాశీల సభ్యులు","contact":"మమ్ము సంప్రదించండి","contact_info":"ఈ సంధర్భంలో క్లిష్టమైన సమస్య లేదా అత్యవసర విషయం సైట్ ను ప్రభావితం చేస్తుంది, దయచేసి మమ్మల్ని సంప్రదించండి %{contact_info}."},"bookmarked":{"title":"పేజీక","clear_bookmarks":"పేజీక లను తుడిచివేయి","help":{"bookmark":"ఈ అంశంపై మొదటి టపాకి పేజీకలను పెట్టండి","unbookmark":"ఈ అంశంపై అన్ని పేజీకలను తొలగించడానికి నొక్కండి"}},"bookmarks":{"not_logged_in":"క్షమించాలి. విషయాలకు పేజీక ఉంచడానికి లాగిన్ అయి ఉండాలి","created":"ఈ టపాకు పేజీక ఉంచారు","not_bookmarked":"ఈ టపాను చదివారు; పేజీక ఉంచుటకు నొక్కండి","last_read":"మీరు చివరాఖరుగా చదివిన టపా ఇది; పేజీక ఉంచుటకు నొక్కండి","remove":"పేజీక తొలగించండి"},"topic_count_latest":{"one":"{{count}} కొత్త లేదా ఉన్నతీకరించిన విషయం","other":"{{count}} కొత్త లేదా ఉన్నతీకరించిన విషయాలు"},"topic_count_unread":{"one":"{{count}} చదవని విషయం.","other":"{{count}} చదవని విషయాలు."},"topic_count_new":{"one":"{{count}} కొత్త విషయం.","other":"{{count}} కొత్త విషయాలు."},"click_to_show":"చూపుటకు ఇక్కడ నొక్కండి","preview":"మునుజూపు","cancel":"రద్దు","save":"మార్పులు భద్రపరచండి","saving":"భద్రపరుస్తున్నాం...","saved":"భద్రం!","upload":"ఎగుమతించు","uploading":"ఎగుమతవుతోంది...","uploaded":"ఎగుమతైంది!","enable":"చేతనం","disable":"అచేతనం","undo":"రద్దు","revert":"తిద్దు","failed":"విఫలం","banner":{"close":"బ్యానరు తుడువు"},"choose_topic":{"none_found":"ఎటువంటి విషయాలూ కనపడలేదు.","title":{"search":"పేరు, యూఆర్ యల్, ఐడీ లను బట్టి విషయాన్ని వెతుకు.","placeholder":"ఇక్కడ విషయపు శీర్షిక రాయండి"}},"queue":{"cancel":"రద్దుచేయి","approval":{"ok":"సరే"}},"user_action":{"user_posted_topic":"\u003ca href='{{topicUrl}}'\u003eవిషయాన్ని\u003c/a\u003e \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e రాసారు ","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eమీరు\u003c/a\u003e  \u003ca href='{{topicUrl}}'\u003eవిషయాన్ని\u003c/a\u003e రాసారు","user_replied_to_post":"\u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e కు \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e  జవాబిచ్చారు","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eమీరు\u003c/a\u003e  \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e కు జవాబిచ్చారు","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003eకు \u003ca href='{{topicUrl}}'\u003eవిషయానికి\u003c/a\u003e జవాబిచ్చారు","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eమీరు\u003c/a\u003e కు \u003ca href='{{topicUrl}}'\u003eవిషయానికి\u003c/a\u003e జవాబిచ్చారు","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e,  \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e ను ప్రస్తావించారు","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e, \u003ca href='{{user2Url}}'\u003eమిమ్ము\u003c/a\u003e ప్రస్తావించారు","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eమీరు\u003c/a\u003e, \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e ను ప్రస్తావించారు","posted_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e రాసారు","posted_by_you":"\u003ca href='{{userUrl}}'\u003eమీరు\u003c/a\u003e రాసారు","sent_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e పంపారు","sent_by_you":"\u003ca href='{{userUrl}}'\u003eమీరు\u003c/a\u003e పంపారు"},"directory":{"title":"వాడుకరులు"},"groups":{"visible":"గుంపు అందరు సభ్యులకు కనిపిస్తుంది","title":{"one":"గుంపు","other":"గుంపులు"},"members":"సభ్యులు","posts":"టపాలు","alias_levels":{"title":"ఈ గుంపును మారుపేరుతో ఎవరు వాడవచ్చు?","nobody":"ఎవరూకాదు","only_admins":"కేవలం అధికారులే","mods_and_admins":"కేవలం అధికారులు మరియు నిర్వాహకులు మాత్రమే","members_mods_and_admins":"కేవలం గుంపు సభ్యులు, నిర్వాహకులు మరియు అధికారులు","everyone":"అందరూ"}},"user_action_groups":{"1":"ఇచ్చిన ఇష్టాలు ","2":"వచ్చిన ఇష్టాలు","3":"పేజీకలు","4":"విషయాలు","7":"ప్రస్తావనలు","9":"కోట్ లు","10":"నక్షత్రపు","11":"సవరణలు","12":"పంపిన అంశాలు","13":"ఇన్ బాక్స్"},"categories":{"all":"అన్ని వర్గాలు","all_subcategories":"అన్నీ","no_subcategory":"ఏదీకాదు","category":"వర్గం","posts":"టపాలు","topics":"విషయాలు","latest":"తాజా","latest_by":"నుండి తాజా","toggle_ordering":"వరుస నియంత్రణను అటుఇటుచేయి","subcategories":"ఉప వర్గాలు","topic_stats":"కొత్త విషయాల సంఖ్య","topic_stat_sentence":{"one":"%{unit} కాలంలో %{count} ఒక కొత్త టపా.","other":" %{unit} గతంలో %{count} కొత్త విషయాలు."},"post_stats":"కొత్త టపాల సంఖ్య","post_stat_sentence":{"one":" %{unit} గతంలో %{count} కొత్త విషయం","other":" %{unit} గతంలో %{count} కొత్త విషయాలు."}},"ip_lookup":{"title":"ఐపీ చిరునామా లుకప్","hostname":"అతిథిపేరు","location":"ప్రాంతం","location_not_found":"(తెలీని)","organisation":"సంస్థ","phone":"ఫోన్","other_accounts":"ఈ ఐపీ చిరునామాతో ఇతర ఖాతాలు:","delete_other_accounts":"%{count} తొలగించు","username":"సభ్యనామం","trust_level":"టీయల్","read_time":"చదువు సమయం","topics_entered":"రాసిన విషయాలు ","post_count":"# టపాలు","confirm_delete_other_accounts":"మీరు నిజ్జంగా ఈ ఖాతాలు తొలగించాలనుకుంటున్నారా?"},"user":{"said":"{{username}}:","profile":"ప్రవర","mute":"నిశ్శబ్దం","edit":"అభిరుచులు సవరించు","download_archive":"నా టపాలు దిగుమతించు","private_messages":"సందేశాలు","activity_stream":"కలాపం","preferences":"అభిరుచులు","bookmarks":"పేజీకలు","bio":"నా గురించి","invited_by":"ఆహ్వానిచినవారు","trust_level":"నమ్మకపు స్థాయి","notifications":"ప్రకటనలు","dismiss_notifications":"అన్నీ చదివినట్టు గుర్తించు","dismiss_notifications_tooltip":"అన్ని చదవని ప్రకటనలూ చదివినట్టు గుర్తించు","disable_jump_reply":"నేను జవాబిచ్చాక నా టపాకు వెళ్లవద్దు","edit_history_public":"ఇతర సభ్యలను నా టపా దిద్దుబాట్లను చూడనివ్వు","external_links_in_new_tab":"అన్ని బాహ్య లంకెలనూ కొత్త ట్యాబులో తెరువు","enable_quoting":"హైలైట్ అయిన పాఠ్యానికి కోట్ జవాబు చేతనం చేయి","change":"మార్చు","moderator":"{{user}} ఒక నిర్వాహకుడు","admin":"{{user}} ఒక అధికారి","moderator_tooltip":"ఈ సభ్యుడు ఒక నిర్వాహకుడు","admin_tooltip":"ఈ సభ్యుడు ఒక అధికారి","suspended_notice":"ఈ సభ్యుడు {{date}} వరకూ సస్పెండయ్యాడు","suspended_reason":"కారణం:","github_profile":"గిట్ హబ్","mailing_list_mode":"ప్రతి కొత్త టపాకూ నాకో ఈమెయిల్ పంపు (నేనా విషయాన్ని లేదా వర్గాన్ని నిశ్శబ్దించేంతవరకూ)","watched_categories":"ఒకకన్నేసారు","tracked_categories":"గమనించారు","muted_categories":"నిశ్శబ్దం","delete_account":"నా ఖాతా తొలగించు","delete_account_confirm":"నిజ్జంగా మీరు మీ ఖాతాను శాస్వతంగా తొలగించాలనుకుంటున్నారా? ఈ చర్య రద్దుచేయలేరు సుమా! ","deleted_yourself":"మీ ఖాతా విజయవంతంగా తొలగించబడింది. ","delete_yourself_not_allowed":"మీ ఖాతాను ఇప్పుడు తొలగించలేరు. మీ ఖాతాను తొలగించడానికి అధికారిని సంప్రదించండి. ","unread_message_count":"సందేశాలు","admin_delete":"తొలగించు","users":"వాడుకరులు","staff_counters":{"flags_given":"సహాయకారి కేతనాలు","flagged_posts":"కేతనించిన టపాలు","deleted_posts":"తొగలించిన టపాలు","suspensions":"సస్పెన్షన్లు","warnings_received":"హెచ్చరికలు"},"messages":{"all":"అన్నీ","mine":"నావి","unread":"చదవని"},"change_password":{"success":"(ఈమెయిల్ పంపిన)","in_progress":"(ఈమెయిల్ పంపుతోన్నాం)","error":"(దోషం)","action":"సంకేతపద రీసెట్ ఈమెయిల్ పంపు","set_password":"సంకేతపదం అమర్చు"},"change_about":{"title":"నా గురించి మార్చు"},"change_username":{"title":"సభ్యనామం మార్చు","confirm":"మీరు సభ్యనామం మారిస్తే, మీ టపాల అన్ని గత కోట్లు మరియు @పేరు ప్రస్తావనలు సరిగ్గా పనిచెయ్యవు. మీరు నిజ్జంగానే సభ్యనామం మార్చాలనుకుంటున్నారా? ","taken":"క్షమించాలి, ఆ సభ్యనామం వేరొకరు తీసుకున్నారు.","error":"మీ సభ్యనామం మార్చడంలో దోషం.","invalid":"ఆ సభ్యనామం చెల్లనిది. కేవలం సంఖ్యలు, అక్షరాలు మాత్రమే కలిగి ఉండాలి. "},"change_email":{"title":"ఈమెయిల్ మార్చు","taken":"క్షమించాలి. ఆ ఈమెయిల్ అందుబాటులో లేదు.","error":"మీ ఈమెయిల్ మార్చడంలో దోషం. బహుశా ఆ చిరునామా ఇప్పటికే ఈ సైటులో వాడుకలో ఉందేమో? ","success":"ఆ చిరునామాకు మేము వేగు పంపాము. అందులోని సూచనలు అనుసరించండి. "},"change_avatar":{"title":"మీ ప్రవర బొమ్మ మార్చండి.","gravatar":"ఆధారపడిన \u003ca href='//gravatar.com/emails' target='_blank'\u003eగ్రావతారం\u003c/a\u003e","refresh_gravatar_title":"మీ గ్రావతారం తాజాపరుచు","letter_based":"వ్యవస్థ కేటాయించిన ప్రవర బొమ్మ","uploaded_avatar":"అనురూప బొమ్మ","uploaded_avatar_empty":"అనురూప బొమ్మను కలపండి","upload_title":"మీ బొమ్మను కలపండి","upload_picture":"బొమ్మను ఎగుమతించండి"},"change_profile_background":{"title":"ప్రవర వెనుతలం","instructions":"ప్రవర వెనుతలాలు కేంద్రీకరించబడతాయి మరియు అప్రమేయ వెడల్పు 850 పిక్సెలు ఉంటాయి."},"change_card_background":{"title":"సభ్య కార్డు వెనుతలం","instructions":"వెనుతలం బొమ్మలు కేంద్రీకరించబడతాయి మరియు అప్రమేయ వెడల్పు 590 పిక్సెలు ఉంటాయి."},"email":{"title":"ఈమెయిల్","instructions":"జనాలకు ఎప్పుడూ చూపవద్దు","ok":"ద్రువపరుచుటకు మీకు ఈమెయిల్ పంపాము","invalid":"దయచేసి చెల్లుబాటులోని ఈమెయిల్ చిరునామా రాయండి","authenticated":"మీ ఈమెయిల్  {{provider}} చేత ద్రువీకరించబడింది"},"name":{"title":"పేరు","instructions":"మీ పూర్తి పేరు (ఐచ్చికం)","too_short":"మీ పేరు మరీ చిన్నది","ok":"మీ పేరు బాగుంది"},"username":{"title":"వాడుకరి పేరు","instructions":"ఏకైకం, జాగాలేని, పొట్టి","short_instructions":"జనాలు మిమ్మల్ని @{{username}} అని ప్రస్తావించవచ్చు","available":"మీ సభ్యనామం అందుబాటులో ఉంది.","global_match":"ఈమెయిల్ రిజిస్టరు అయిన సభ్యనామంతో సరిపోతోంది.","global_mismatch":"ఇప్పటికే రిజిస్టరు అయింది. {{suggestion}} ప్రయత్నించండి? ","not_available":"అందుబాటులో లేదు. {{suggestion}} ప్రయత్నించండి?","too_short":"మీ సభ్యనామం మరీ చిన్నది","too_long":"మీ సభ్యనామం మరీ పొడుగు","checking":"సభ్యనామం అందుబాటు పరిశీలిస్తున్నాం...","enter_email":"సభ్యనామం కనిపించింది; సరిపోలు ఈమెయిల్ రాయండి","prefilled":"ఈమెయిల్ రిజిస్టరు అయిన సభ్యనామంతో సరిపోతోంది"},"locale":{"title":"ఇంటర్ఫేస్ భాష","instructions":"యూజర్ ఇంటర్ఫేస్ భాష. పుట తాజాపరిస్తే ఇది మారుతుంది. ","default":"(అప్రమేయ)"},"password_confirmation":{"title":"సంకేతపదం మరలా"},"last_posted":"చివరి టపా","last_emailed":"చివరగా ఈమెయిల్ చేసింది","last_seen":"చూసినది","created":"చేరినది","log_out":"లాగవుట్","location":"ప్రాంతం","card_badge":{"title":"సభ్యు బ్యాడ్జి కార్డు"},"website":"వెబ్ సైటు","email_settings":"ఈమెయిల్","email_digests":{"title":"నేను ఇక్కడికి రాకపోతే, కొత్త విషయాలు నాకు ఈమెయిల్ గా పంపండి:","daily":"ప్రతీరోజు","every_three_days":"ప్రతి మూడు రోజులకీ","weekly":"ప్రతీవారం","every_two_weeks":"ప్రతి రెండు వారాలకీ"},"other_settings":"ఇతర","categories_settings":"వర్గాలు","new_topic_duration":{"label":"విషయాలు కొత్తగా భావించు, ఎప్పుడంటే","not_viewed":"నేను వాటిని ఇంకా చూడనప్పుడు","last_here":"నేను చివరిసారి ఇక్కడికి వచ్చిన తర్వాత సృష్టించినవి"},"auto_track_topics":"నేను రాసే విషయాలు ఆటోమేటిగ్గా గమనించు","auto_track_options":{"never":"ఎప్పటికీ వద్దు"},"invited":{"search":"ఆహ్వానాలను వెతకడానికి రాయండి ... ","title":"ఆహ్వానాలు","user":"ఆహ్వానించిన సభ్యుడు","redeemed":"మన్నించిన ఆహ్వానాలు","redeemed_at":"మన్నించిన","pending":"పెండింగులోని ఆహ్వానాలు","topics_entered":"చూసిన విషయాలు","posts_read_count":"చదివిన టపాలు","expired":"ఈ ఆహ్వానం కాలాతీతమైంది.","rescind":"తొలగించు","rescinded":"ఆహ్వానం తొలగించారు","reinvite":"ఆహ్వానం మరలా పంపు","reinvited":"ఆహ్వానం మరలా పంపారు","time_read":"చదువు సమయం","days_visited":"దర్శించిన రోజులు","account_age_days":"రోజుల్లో ఖాతా వయసు","create":"ఒక ఆహ్వానం పంపు","bulk_invite":{"none":"మీరు ఇంకా ఎవరినీ ఆహ్వానించలేదు. మీరు వ్యక్తిగత ఆహ్వానాలు పంపవచ్చు, లేదా కొంతమందికి ఒకేసారి \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eఆహ్వాన దస్త్రం ఎగుమతించుట ద్వారా\u003c/a\u003e పంపవచ్చు.","text":"దస్త్రం నుండి బహుళ ఆహ్వానాలు","uploading":"ఎగుమతవుతోంది...","error":"'{{filename}}' ఎగుమతించుటలో దోషం: {{message}}"}},"password":{"title":"సంకేతపదం","too_short":"మీ సంకేతపదం మరీ చిన్నది.","common":"ఆ సంకేతపదం మరీ సాధారణం.","same_as_username":"మీ సంకేతపదం మీ వినియోగదారుపేరు ని పోలి ఉంది.","same_as_email":"మీ సంకేతపదం మీ ఈమెయిల్ ను పోలి ఉంది.","ok":"మీ సంకేతపదం బాగుంది.","instructions":"కనీసం %{count}  అక్షరాలు ఉండాలి."},"associated_accounts":"లాగిన్లు","ip_address":{"title":"చివరి ఐపీ చిరునామా"},"registration_ip_address":{"title":"రిజిస్ట్రేషన్ ఐపీ చిరునామా"},"avatar":{"title":"ప్రవర బొమ్మ"},"title":{"title":"శీర్షిక"},"filters":{"all":"అన్నీ"},"stream":{"posted_by":"టపా రాసినవారు","sent_by":"పంపినవారు","the_topic":"విషయం"}},"loading":"లోడవుతోంది...","errors":{"prev_page":"ఎక్కించుట ప్రయత్నిస్తున్నప్పుడు","reasons":{"network":"నెట్వర్క్ దోషం","server":"సేవిక దోషం","forbidden":"అనుమతి నిరాకరించబడింది","unknown":"దోషం"},"desc":{"network":"దయచేసి మీ కనక్షన్ సరిచూడండి. ","network_fixed":"ఇప్పుడు మరలా పనిచేస్తుంది.","server":"దోష కోడు:  {{status}}","forbidden":"దాన్ని చూడటానికి మీకు అనుమతి లేదు","unknown":"ఏదో తేడా జరిగింది."},"buttons":{"back":"వెనక్కు వెళ్లండి","again":"మళ్ళీ ప్రయత్నించండి","fixed":"పుట ఎక్కించండి"}},"close":"మూసివేయి","assets_changed_confirm":"ఈ సైటు ఇప్పుడే ఉన్నతీకరించబడింది. కొత్త రూపాంతరం చూడటానికి తాజాపరచండి?","logout":"మీరు లాగవుట్ అయ్యారు.","refresh":"తాజాపరుచు","read_only_mode":{"login_disabled":"సేటు కేవలం చదివే రీతిలో ఉన్నప్పుడు లాగిన్ వీలవదు."},"learn_more":"మరింత తెలుసుకోండి...","year":"సంవత్సరం","year_desc":"గత 365 రోజులలో సృష్టించిన విషయాలు","month":"నెల","month_desc":"గత 30 రోజులలో సృష్టించిన విషయాలు","week":"వారం","week_desc":"గత 7 రోజులలో సృష్టించిన విషయాలు","day":"రోజు","first_post":"తొలి టపా","mute":"నిశ్శబ్దం","unmute":"వినిశ్శబ్దం","last_post":"చివరి టపా","summary":{"enabled_description":"మీరు ఈ విషయపు సారాంశము చదువుతున్నారు. ఆసక్తికర టపాలు కమ్యునిటీ ఎంచుకుంటుంది. ","description":"అక్కడ మొత్తం \u003cb\u003e{{count}}\u003c/b\u003e జవాబులు ఉన్నాయి","description_time":"అక్కడ మొత్తం \u003cb\u003e{{count}}\u003c/b\u003e జవాబులు ఉన్నాయి. వీటిని చదవడానికి సుమారుగా \u003cb\u003e{{readingTime}} నిమిషాలు\u003c/b\u003e పడ్తాయి.","enable":"ఈ విషయాన్ని సంగ్రహించు","disable":"అన్ని టపాలూ చూపు"},"deleted_filter":{"enabled_description":"ఈ విషయం తొలగించిన టపాలు కలిగి ఉంది. అవి దాయబడ్డాయి.","disabled_description":"ఈ విషయంలోని తొలగించిన టపాలు చూపుతున్నాము.","enable":"తొలగించిన టపాలు దాయు","disable":"తొలగించిన టపాలు చూపు"},"private_message_info":{"invite":"ఇతరులను ఆహ్వానించు"},"email":"ఈమెయిల్","username":"వాడుకరి పేరు","last_seen":"చూసిన","created":"సృష్టించిన","created_lowercase":"సృష్టించిన","trust_level":"నమ్మకపు స్థాయి","search_hint":"సభ్యనామం, ఈమెయిల్ మరియు ఐపీ చిరునామా","create_account":{"title":"కొత్త ఖాతా సృష్టించు","failed":"ఏదో తేడా జరిగింది. బహుశా ఈమెయిల్ ఇప్పటికే ఈసైటులో రిజిస్టరు అయి ఉందేమో, సంకేతపదం మర్చిపోయా లంకె ప్రయత్నించు."},"forgot_password":{"action":"నేను నా సంకేతపదాన్ని మర్చిపోయాను","invite":"మీ సభ్యనామం లేదా ఈమెయిల్ చిరునామా రాయండి, మేము మీ సంకేతపదం మార్చే విధం మీకు ఈమెయిల్ చేస్తాము.","reset":"రీసెట్ సంకేతపదం","complete_username":"సభ్యనామం  \u003cb\u003e%{username}\u003c/b\u003e తో ఈ ఖాతా సరిపోతే మీకు సంకేతపదం రీసెట్ చేసే సూచనలు ఈమెయిల్ ద్వారా వస్తాయి. ","complete_email":"ఈమెయిల్  \u003cb\u003e%{email}\u003c/b\u003e తో ఈ ఖాతా సరిపోతే మీకు సంకేతపదం రీసెట్ చేసే సూచనలు ఈమెయిల్ ద్వారా వస్తాయి. ","complete_username_found":"మేము ఈ సభ్యనామం \u003cb\u003e%{username}\u003c/b\u003e తో సరిపోయే ఒక ఖాతా కనుగొన్నాము, మీకు అతి త్వరలో సంకేతపదం రీసెట్ చేసే సూచనలతో కూడిన ఈమెయిల్ వస్తుంది.","complete_email_found":"మేము ఈ ఈమెయిల్ \u003cb\u003e%{email}\u003c/b\u003e తో సరిపోయే ఒక ఖాతా కనుగొన్నాము, మీకు అతి త్వరలో సంకేతపదం రీసెట్ చేసే సూచనలతో కూడిన ఈమెయిల్ వస్తుంది.","complete_username_not_found":"మీ సభ్యనామం \u003cb\u003e%{username}\u003c/b\u003e తో ఏ ఖాతా సరిపోవడంలేదు.","complete_email_not_found":"\u003cb\u003e%{email}\u003c/b\u003e తో ఏ ఖాతా సరిపోవడంలేదు"},"login":{"title":"లాగిన్","username":"వాడుకరి","password":"సంకేతపదం","email_placeholder":"ఈమెయిల్ లేదా సభ్యనామం","caps_lock_warning":"క్యాప్స్ లాక్ ఆన్ అయి ఉంది","error":"తెలీని దోషం","blank_username_or_password":"దయచేసి మీ ఈమెయిల్ లేదా సభ్యనామం మరియు సంకేతపదం రాయండి","reset_password":"రీసెట్ సంకేతపదం","logging_in":"ప్రవేశపెడ్తోన్నాం","or":"లేదా","authenticating":"ద్రువీకరిస్తున్నాము...","awaiting_confirmation":"మీ ఖాతా చేతనం కోసం ఎదురుచూస్తుంది. సంకేతపదం మర్చిపోయా లంకెను వాడు మరో చేతన ఈమెయిల్ పొందండి.","awaiting_approval":"మీ ఖాతా ఇంకా సిబ్బంది ఒప్పుకొనలేదు. సిబ్బంది ఒప్పుకోగానే మీకు ఒక ఈమెయిల్ వస్తుంది.","requires_invite":"క్షమించాలి. ఈ పోరమ్ ప్రవేశం కేవలం ఆహ్వానితులకు మాత్రమే.","not_activated":"మీరప్పుడే లాగిన్ అవ్వలేరు. గతంలో మేము మీకు చేతన ఈమెయల్ \u003cb\u003e{{sentTo}}\u003c/b\u003e కు పంపాము. దయచేసి ఆ వేగులోని సూచనలు పాటించి మీ ఖాతాను చేతనం చేసుకోండి.","not_allowed_from_ip_address":"ఆ ఐపీ చిరునామా నుండి మీరు లాగిన్ అవ్వలేరు.","admin_not_allowed_from_ip_address":"మీరు ఆ IP చిరునామా నుండి నిర్వాహకుని వలె లాగిన్ కాలేరు.","resend_activation_email":"చేతన ఈమెయిల్ మరలా పంపడానికి ఇక్కడ నొక్కండి.","sent_activation_email_again":"మీకు \u003cb\u003e{{currentEmail}}\u003c/b\u003e మరో చేతన ఈమెయిల్ పంపాము. అది చేరుకోడానికి కొద్ది నిమిషాలు పట్టవచ్చు. ఇంకా స్పామ్ ఫోల్డరు చూడటం మర్చిపోకండి సుమా. ","google":{"title":"గూగుల్ తో","message":"గూగుల్ ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"},"google_oauth2":{"title":"గూగుల్ తో","message":"గూగుల్ ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"},"twitter":{"title":"ట్విట్టరు తో","message":"ట్విట్టరు ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"},"facebook":{"title":"ఫేస్ బుక్ తో","message":"ఫేస్ బుక్ ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"},"yahoo":{"title":"యాహూ తో","message":"యాహూ ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"},"github":{"title":"గిట్ హబ్ తో","message":"గిట్ హబ్ ద్వారా లాగిన్ (పాపప్ లు అనుమతించుట మర్చిపోకండి)"}},"apple_international":"యాపిల్ , అంతర్జాతీయ","google":"గూగుల్","twitter":"ట్విట్టరు","emoji_one":"ఇమెజి వన్","composer":{"emoji":"Emoji :smile:","add_warning":"ఇది ఒక అధికారిక హెచ్చరిక","posting_not_on_topic":"ఏ విషయానికి మీరు జవాబివ్వాలనుకుంటున్నారు? ","saved_draft_tip":"భద్రం","saved_local_draft_tip":"స్థానికంగా భద్రం","similar_topics":"మీ విషయం దీని వలె ఉంది...","drafts_offline":"చిత్తుప్రతులు ఆఫ్లైను.","error":{"title_missing":"శీర్షిక తప్పనిసరి","title_too_short":"శీర్షిక కనీసం  {{min}} అక్షరాలు ఉండాలి","title_too_long":"శీర్షిక {{max}} అక్షరాలకు మించి ఉండకూడదు","post_missing":"టపా ఖాళీగా ఉండకూడదు","post_length":"టపా కనీసం {{min}} అక్షరాలు కలిగి ఉండాలి","category_missing":"మీరు ఒక వర్గాన్ని ఎంచుకోవాలి"},"save_edit":"దాచి సవరించు","reply_original":"మూల విషయంకు జవాబివ్వు","reply_here":"ఇక్కడ జవాబివ్వు","reply":"జవాబు","cancel":"రద్దుచేయి","title":"లేదా కంట్రోల్ + ఎంటర్ నొక్కు","users_placeholder":"ఒక సభ్యుడిని కలుపు","title_placeholder":"ఈ చర్చ దేనిగురించో ఒక లైనులో చెప్పండి?","edit_reason_placeholder":"మీరెందుకు సవరిస్తున్నారు?","show_edit_reason":"(సవరణ కారణం రాయండి)","view_new_post":"మీ కొత్త టపా చూడండి","saved":"భద్రం!","saved_draft":"టపా చిత్తుప్రతి నడుస్తోంది. కొనసాగించుటకు ఎంచుకోండి.","uploading":"ఎగుమతవుతోంది...","show_preview":"మునుజూపు చూపు \u0026raquo;","hide_preview":"\u0026laquo; మునుజూపు దాచు","quote_post_title":"మొత్తం టపాను కోట్ చేయి","bold_title":"బొద్దు","bold_text":"బొద్దు పాఠ్యం","italic_title":"వాలు","italic_text":"వాలు పాఠ్యం","link_title":"హైపర్ లంకె","link_description":"లంకె వివరణ ఇక్కడ రాయండి","link_dialog_title":"హైపర్ లంకె చొప్పించండి","link_optional_text":"ఐచ్చిక శీర్షిక","quote_title":"బ్లాక్ కోట్","quote_text":"బ్లాక్ కోట్","code_title":"ముందే అలంకరించిన పాఠ్యం","code_text":"ముందే అలంకరించిన పాఠ్యాన్ని 4 జాగాలు జరుపు","upload_title":"ఎగుమతించు","upload_description":"ఎగుమతి వివరణ ఇక్కడ రాయండి","olist_title":"సంఖ్యా జాబితా","ulist_title":"చుక్కల జాబితా","list_item":"జాబితా అంశం","heading_title":"తలకట్టు","heading_text":"తలకట్టు","hr_title":"అడ్డు గీత","help":"మార్క్ డైన్ సవరణ సహాయం","toggler":"దాచు లేదా చూపు కంపోజరు ఫలకం","admin_options_title":"ఈ విషయానికి ఐచ్చిక సిబ్బంది అమరికలు","auto_close":{"label":"విషయపు స్వీయ ముగింపు కాలం:","error":"దయచేసి చెల్లే విలువ రాయండి","based_on_last_post":"ఈ విషయంలో చివరి టపా కనీసం ఇంత వయసు వచ్చేంతవరకూ విషయాన్ని మూయకు.","all":{"examples":"గంటలు (24), సమయం(17:30) లేదా కాలముద్రణ (2013-11-22 14:00) రాయండి."},"limited":{"units":"(# గంటలు)","examples":"గంటల సంఖ్య(24)ను రాయండి."}}},"notifications":{"none":"ఈ సమయంలో ప్రకటనలు చూపలేకున్నాము.","more":"పాత ప్రకటనలు చూడు","total_flagged":"మొత్తం కేతనించిన టపాలు","quoted":"\u003ci title='కోట్ చేసారు' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='జవాబిచ్చారు' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='జవాబిచ్చారు' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title=' సవరించారు' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='ఇష్టపడ్డారు' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='ప్రైవేటు సందేశం' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='ప్రైవేటు సందేశం' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='మీ ఆహ్వానాన్ని మన్నించారు' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='టపా జరిపారు' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='టపాకు లంకె ఉంచారు' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='బ్యాడ్జ్ ప్రసాదించారు' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eEarned '{{description}}'\u003c/p\u003e"},"upload_selector":{"title":"ఒక బొమ్మ కలుపు","title_with_attachments":"ఒక బొమ్మ లేదా దస్త్రం కలుపు","from_my_computer":"నా పరికరం నుండి","from_the_web":"జాలం నుండి","remote_tip":"బొమ్మకు లంకె","hint":"(మీరు వాటిని ఎడిటరులోకి లాగి వదిలెయ్యటు ద్వారా కూడా ఎగుమతించవచ్చు)","uploading":"ఎగుమతవుతోంది","image_link":"మీ బొమ్మ చూపే లంకె"},"search":{"title":"విషయాలు, టపాలు, సభ్యులు లేదా వర్గాలు వెతుకు","no_results":"ఎటువంటి ఫలితాలు దొరకలేదు.","searching":"వెతుకుతున్నామ్...","post_format":"{{username}} నుండి #{{post_number}}","context":{"user":"@{{username}} యొక్క విషయాలు వెతుకు","category":"\"{{category}}\" వర్గంలో వెతుకు","topic":"ఈ విషయంలో వెతుకు"}},"go_back":"వెనక్కు మరలు","not_logged_in_user":"సభ్యుని ప్రస్తుత కలాపాల మరియు అభిరూపాల సారాంశ పుట","current_user":"మీ సభ్యపుటకు వెళ్లు","topics":{"bulk":{"reset_read":"రీలోడ్ రీసెట్","delete":"విషయాలు తొలగించు","dismiss_new":"కొత్తవి తుడువు","toggle":"విషయాల బహుళ ఎంపికలు అటుఇటుచేయి","actions":"బహుళ చర్యలు","change_category":"వర్గం మార్చు","close_topics":"విషయాలు మూయు","archive_topics":"విషయాలు కట్టకట్టు","notification_level":"ప్రకటన స్థాయి మార్చు","choose_new_category":"విషయం కొరకు కొత్త వర్గం ఎంచుకొండి:","selected":{"one":"మీరు \u003cb\u003e1\u003c/b\u003e  విషయం ఎంచుకున్నారు.","other":" మీరు \u003cb\u003e{{count}}\u003c/b\u003e విషయాలు ఎంచుకున్నారు."}},"none":{"unread":"మీరు చదవని విషయాలు లేవు","new":"మీకు కొత్త విషయాలు లేవు","read":"మీరింకా ఏ విషయాలూ చదవలేదు.","posted":"మీరింకా ఏ విషయాలూ రాయలేదు.","latest":"కొత్త విషయాలు లేవు. అహో ఎంతటి విపరిణామం.","hot":"వేడివేడి విషయాలు లేవు.","bookmarks":"మీకింకా ఎట్టి పేజీక విషయాలూ లేవు.","category":"ఎట్టి {{category}}  విషయాలూ లేవు","top":"ఎట్టి అగ్ర విషయాలూ లేవు.","educate":{"new":"\u003cp\u003eమీ కొత్త విషయాలు ఇక్కడ వస్తాయి.\u003c/p\u003e\u003cp\u003eఅప్రమేయంగా 2 రోజులలోపు సృష్టించిన అన్ని విషయాలూ కొత్తగా భావించబడతాయి మరియు  \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eకొత్త\u003c/span\u003e ఇండికేటరు తో చూపబడతాయి.\u003c/p\u003e\u003cp\u003eమీరు దీన్ని మీ \u003ca href=\"%{userPrefsUrl}\"\u003eఅభీష్టాలులో\u003c/a\u003e మార్చుకోవచ్చు.\u003c/p\u003e","unread":"\u003cp\u003eమీరు చదవని విషయాలు ఇక్కడ కనబడుతాయి.\u003c/p\u003e\u003cp\u003eఅప్రమేయంగా, విషయాలు చదవని వాటిగా పరిశీలించబడతాయి మరియు చదవని వాటి సంఖ్య మీకు చూపబడతాయి \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e మీరు:\u003c/p\u003e\u003cul\u003e\u003cli\u003eవిషయం సృష్టించినట్లయితే\u003c/li\u003e\u003cli\u003eవిషయానికి సమాధానం ఇచ్చినట్లయితే\u003c/li\u003e\u003cli\u003eవిషయం 4 నిమిషాల కంటే ఎక్కువ చదివినట్లయితే\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eలేదా మీరు స్పష్టముగా విషయం అమర్చినట్లయితే ప్రతి విషయానికి క్రింది భాగంలో నియంత్రణ ప్రకటన ద్వారా గమనించబడుతుంది లేదా కనిపెడుతూ ఉంటుంది  .\u003c/p\u003e\u003cp\u003eమీరు ఇది మార్చగలరు \u003ca href=\"%{userPrefsUrl}\"\u003e మీ preferences లో\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"ఇంకా కొత్త విషయాలు లేవు.","hot":"ఇంకా వేడివేడి విషయాలు లేవు.","posted":"ఇంకా రాసిన విషయాలు లేవు.","read":"ఇంకా చదవని విషయాలు లేవు.","new":"కొత్త విషయాలు లేవు.","unread":"ఇంకా చదవని విషయాలు లేవు.","category":"ఇంకా {{category}}  విషయాలు లేవు.","top":"ఇంకా అగ్ర విషయాలు లేవు.","bookmarks":"ఇంకా పేజీక విషయాలు లేవు."}},"topic":{"filter_to":"విషయంలో {{post_count}} టపాలున్నాయి","create":"కొత్త విషయం","create_long":"కొత్త విషయం సృష్టించు","list":"విషయాలు","new":"కొత్త విషయం","unread":"చదవని","new_topics":{"one":"1 కొత్త విషయం","other":"{{count}} కొత్త విషయాలు"},"unread_topics":{"one":"1 చదవని విషయం","other":"{{count}} చదవని విషయాలు"},"title":"విషయం","invalid_access":{"title":"విషయం ప్రైవేటు","description":"క్షమించాలి, ఆ విషయానికి మీకు అనుమతి లేదు!","login_required":"ఆ విషయం చదవడానికి మీరు లాగిన్ అయి ఉండాలి."},"server_error":{"title":"విషయాలు చూపుట విఫలమైంది","description":"క్షమించాలి. ఆ విషయం చూపలేకున్నాము. బహుశా కనక్షను సమస్య వల్ల అనుకుంటాను.దయచేసి మరలా ప్రయత్నించండి. సమస్య కొనసాగితే మాకు తెలియపర్చండి."},"not_found":{"title":"విషయం కనిపించలేదు","description":"క్షమించాలి. ఆ విషయం మేము కనుగొనలేకున్నాము. బహుశా నిర్వాహకులు దాన్ని తొలగించారేమో?"},"total_unread_posts":{"one":"మీకు ఈ విషయంలో 1 చదవని టపా ఉంది","other":"మీకు ఈ విషయంలో {{count}} చదవని టపాలు ఉన్నాయి"},"unread_posts":{"one":"మీకు ఈ విషయంలో 1 చదవని పాత టపా ఉంది","other":"మీకు ఈ విషయంలో {{count}} చదవని పాత టపాలు ఉన్నాయి"},"new_posts":{"one":"మీరు చివరసారి చదివాక ఈ విషయంలో  1 కొత్త టపా వచ్చింది","other":"మీరు చివరసారి చదివాక ఈ విషయంలో  {{count}} కొత్త టపాలు వచ్చాయి"},"likes":{"one":"ఈ విషయానికి 1 ఇష్టం ఉంది","other":"ఈ విషయానికి {{count}} ఇష్టాలు ఉన్నాయి"},"back_to_list":"విషయాల జాబితాకు మరలు","options":"విషయపు ఐచ్చికాలు","show_links":"ఈ విషయంలో లంకెలు చూపు","toggle_information":"విషయపు వివరాలు అటుఇటుచేయి","read_more_in_category":"మరింత చదవాలనుకుంటున్నారా? {{catLink}} లేదా {{latestLink}} లో ఇతర విషయాలు చూడు.","read_more":"మరిన్ని చదవాలనుకుంటున్నారా? {{catLink}} లేదా {{latestLink}}.","browse_all_categories":"అన్ని వర్గాలూ జల్లించు","view_latest_topics":"తాజా విషయాలు చూడు","suggest_create_topic":"ఓ విషయమెందుకు సృష్టించకూడదూ?","jump_reply_up":"పాత జవాబుకు వెళ్లు","jump_reply_down":"తరువాతి జవాబుకు వెళ్లు","deleted":"ఈ విషయం తొలగించబడింది","auto_close_notice":"ఈ విషయం %{timeLeft} తర్వాత స్వీయంగా మూయబడుతుంది.","auto_close_notice_based_on_last_post":"చివరి జవాబు తర్వాత %{duration}కు ఈ విషయం స్వీయ మూయబడుతుంది","auto_close_title":"స్వీయ ముగింపు అమరికలు","auto_close_save":"దాచు","auto_close_remove":"ఈ విషయాన్ని స్వీయ ముగించవద్దు","progress":{"title":"విషయపు పురోగతి","go_top":"అగ్ర","go_bottom":"అడుగు","go":"వెళ్లు","jump_bottom_with_number":"%{post_number} టపాకు వళ్లు","total":"అన్ని టపాలు","current":"ప్రస్తుత టపా","position":"%{total} లో %{current} టపా"},"notifications":{"reasons":{"3_6":"మీకు ప్రకటనలు వస్తాయి, ఎందుకంటే మీరు ఈ వర్గాంపై కన్నేసారు","3_5":"మీకు ప్రకటనలు వస్తాయి, ఎందుకంటే ఈ విషయం స్వీయ కన్నేసారు. ","3_2":"మీకు ప్రకటనలు వస్తాయి, ఎందుకంటే మీరు ఈ విషయంపై కన్నేసారు.","3_1":"మీకు ప్రకటనలు వస్తాయి ఎందుకంటే మీరు ఈ విషయాన్ని సృష్టించారు.","3":"మీకు ప్రకటనలు వస్తాయి, ఎందుకంటే మీరు ఈ విషయంపై కన్నేసారు.","2_8":"మీకు ప్రకటనలు వస్తాయి ఎందుకంటే మీరు ఈ వర్గాన్ని గమనిస్తున్నారు.","2_4":"మీకు ప్రకటనలు వస్తాయి ఎందుకంటే మీరు ఈ విషయానికి జవాబిచ్చారు.","2_2":"మీకు ప్రకటనలు వస్తాయి ఎందుకంటే మీరు ఈ విషయాన్ని గమనిస్తున్నారు.","2":"మీకు ప్రకటనలు వస్తాయి, ఎందుకంటే \u003ca href=\"/users/{{username}}/preferences\"\u003eమీరు ఈ విషయాన్ని చదివారు\u003c/a\u003e.","0_7":"ఈ వర్గంలోని అన్ని ప్రకటనలనూ మీరు విస్మరిస్తున్నారు.","0_2":"ఈ విషయంలోని అన్ని ప్రకటనలనూ మీరు విస్మరిస్తున్నారు.","0":"ఈ విషయంలోని అన్ని ప్రకటనలనూ మీరు విస్మరిస్తున్నారు."},"watching_pm":{"title":"కన్నేసారు"},"watching":{"title":"కన్నేసారు"},"tracking_pm":{"title":"గమనిస్తున్నారు"},"tracking":{"title":"గమనిస్తున్నారు"},"muted_pm":{"title":"నిశ్శబ్దం"},"muted":{"title":"నిశ్శబ్దం"}},"actions":{"recover":"విషయం తొలగింపు రద్దుచేయి","delete":"విషయం తొలగించు","open":"విషయం తెరువు","close":"విషయం మూయు","unarchive":"విషయాన్ని కట్టవిప్పు","archive":"విషయాన్ని కట్టకట్టు","invisible":"అజ్జాబితాగా గుర్తించు","visible":"జాబితాగా గుర్తించు","reset_read":"చదివిన గణాంకాలను రీసెట్ చేయి"},"reply":{"title":"జవాబు","help":"ఈ విషయానికి జవాబివ్వుట ప్రారంభించు"},"clear_pin":{"title":"గుచ్చు శుభ్రపరుచు","help":"ఈ విషయపు గుచ్చు స్థితి శుభ్రపరుచు. తద్వారా అది ఇహ అగ్ర భాగాన కనిపించదు"},"share":{"title":"పంచు","help":"ఈ విషయపులంకెను పంచు"},"flag_topic":{"title":"కేతనం","help":"ఈ విషయాన్ని ప్రైవేటుగా కేతనించు లేదా ప్రైవేటు ప్రకటన పంపు","success_message":"ఈ విషయాన్ని మీరు కేతనించారు"},"inviting":"ఆహ్వానిస్తున్నామ్...","automatically_add_to_groups_optional":"ఈ ఆహ్వానం ఈ గుంపులకు అనుమతిని కూడా కలిగి ఉంది:(ఐచ్చికం, అధికారులు మాత్రమే)","automatically_add_to_groups_required":"ఈ ఆహ్వానం ఈ గుంపులకు అనుమతిని కూడా కలిగి ఉంది:(\u003cb\u003eతప్పనిసరి\u003c/b\u003e, అధికారులు మాత్రమే)","invite_private":{"email_or_username":"ఆహ్వానితుని ఈమెయిల్ లేదా సభ్యనామం","email_or_username_placeholder":"ఈమెయిల్ చిరునామా లేదా సభ్యనామం","action":"ఆహ్వానించు","error":"క్షమించాలి. ఆ సభ్యుడిని ఆహ్వానించుటలో దోషం.","group_name":"గుంపు పేరు"},"invite_reply":{"title":"ఆహ్వానించు","username_placeholder":"వాడుకరి పేరు","to_forum":"మేము మీ స్నేహితునికి ఒక ఈమెయిల్ పంపుతాము. అందులోని లంకె ద్వారా వారు లాగిన్ అవసరం లేకుండానే నేరుగా ఈ చర్చలో పాల్గొనవచ్చు, జవాబివ్వవచ్చు.","email_placeholder":"name@example.com"},"login_reply":"జవాబివ్వడానికి లాగిన్ అవ్వండి","filters":{"n_posts":{"one":"1 టపా","other":"{{count}} టపాలు"},"cancel":"జల్లెడ తొలగించు"},"split_topic":{"title":"కొత్త విషయానికి జరుపు","action":"కొత్త విషయానికి జరుపు","topic_name":"కొత్త విషయపు పేరు","error":"టపాలను కొత్త విషయానికి జరిపేటప్పుడు దోషం తలెత్తింది","instructions":{"one":"మీరు కొత్త విషయం సృష్టించి దాన్ని మీరు ఈ  టపాతో నింపబోతున్నారు.","other":"మీరు కొత్త విషయం సృష్టించి దాన్ని \u003cb\u003e{{count}}\u003c/b\u003e  టపాలతో నింపబోతున్నారు."}},"merge_topic":{"title":"ఇప్పటికే ఉన్న విషయానికి జరుపు","action":"ఇప్పటికే ఉన్న విషయానికి జరుపు","error":" ఆ విషయంలోకి టపాలను జరపడంలో దోషం.","instructions":{"one":"ఈ  టపాలు జరపాలనుకున్న విషయాన్ని ఎంచుకోండి.","other":"ఈ  \u003cb\u003e{{count}}\u003c/b\u003e టపాలను జరపాలనుకున్న విషయాన్ని ఎంచుకోండి."}},"change_owner":{"title":"టపాల యజమానిని మార్చండి","action":"యజమానిని మార్చు","error":"ఆ టపాల యజమానిని మార్చేప్పుడు దోషం జరిగింది.","label":"టపాల కొత్త యజమాని","placeholder":"కొత్త యజమాని సభ్యనామం","instructions":{"one":"\u003cb\u003e{{old_user}}\u003c/b\u003e యొక్క టపాకు కొత్త యజమానిని ఎంచుకోండి.","other":"\u003cb\u003e{{old_user}}\u003c/b\u003e యొక్క {{count}} టపాల కొత్త యజమానిని ఎంచుకోండి."},"instructions_warn":"ఈ పోస్ట్ గురించిన ఏ గత ప్రకటనలైనా కొత్త వినియోగదారునికి బదిలీకావని గమనించండి.\u003cbr\u003eహెచ్చరిక: ప్రస్తుతం,ఏ ఆధారిత సమాచారం కొత్త వినియోగదారుకి బదిలీ చేయబడదు.ముందుజాగ్రత్త తో వినియోగించండి."},"multi_select":{"select":"ఎంచుకో","selected":"ఎంచుకున్నవి  ({{count}})","select_replies":"ఎంచుకున్నవి +జవాబులు","delete":"ఎంచుకున్నవి తొలగించు","cancel":"ఎంపిక రద్దు","select_all":"అన్నీ ఎంచుకో","deselect_all":"అన్నీ వియెంచుకో","description":{"one":"మీరు \u003cb\u003e1\u003c/b\u003e టపా ఎంచుకున్నారు","other":"మీరు \u003cb\u003e{{count}}\u003c/b\u003e టపాలు ఎంచుకున్నారు"}}},"post":{"quote_reply":"కోట్ జవాబు","edit_reason":"కారణం:","post_number":"టపా {{number}}","last_edited_on":"టపా చివర సవరించిన కాలం","reply_as_new_topic":"లంకె విషయంగా జవాబివ్వు","continue_discussion":"{{postLink}} నుండి చర్చ కొనసాగుతుంది;","follow_quote":"కోటెడ్ టపాకు వెళ్లు","show_full":"పూర్తి టపా చూపు","show_hidden":"దాగిన విషయం చూపు","deleted_by_author":{"one":" (టపా రచయిత ద్వారా తొలగింపబడింది , స్వతస్సిధ్దంగా తొలగింపబ[ది %{count} కాకపోతే సమయం కేతనించలేదు)","other":"(టపా రచయిత ద్వారా ఉపసంహరించబడింది , స్వతసిధ్ధంగా తొలగించబడతాయి %{count} కాకపోతే సమయం కేతనించలేదు)"},"expand_collapse":"పెంచు/తుంచు","more_links":"{{count}} ఇంకా...","unread":"టపా చదవనిది","errors":{"create":"క్షమించాలి. మీ టపా సృష్టించుటలో దోషం. దయచేసి మరలా ప్రయత్నించండి. ","edit":"క్షమించాలి. మీ టపా సవరించుటలో దోషం. మరలా ప్రయత్నించండి","upload":"క్షమించాలి. దస్త్రం ఎగుమతించుటలో దోషం. దయచేసి మరలా ప్రయత్నించండి. ","attachment_too_large":"క్షమించాలి. మీరు ఎగుమతించ ప్రయత్నిస్తున్న దస్త్రం మరీ పెద్దది. (గరిష్ట పరిమాణ పరిమితి {{max_size_kb}}కేబీ).","file_too_large":"క్షమించాలి. మీరు ఎగుమతించ ప్రయత్నిస్తున్న దస్త్రం మరీ పెద్దది. (గరిష్ట పరిమాణ పరిమితి {{max_size_kb}}కేబీ).","too_many_uploads":"క్షమించాలి. మీరు ఒకసారి ఒక దస్త్రం మాత్రమే ఎగుమతించగలరు","too_many_dragged_and_dropped_files":"క్షమించాలి. మీరు కేవలం 10 దస్త్రాల వరకు మాత్రమే ఒకేమారు లాగి వదలగలరు. ","upload_not_authorized":"క్షమించాలి. మీరు ఎగుమతించాలనుకుంటున్న దస్త్రం అధీకృతమైనది కాదు. (అధీకృత పొడిగింతలు:{{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"క్షమించాలి. కొత్త సభ్యులు బొమ్మలు ఎగుమతి చేయలేరు.","attachment_upload_not_allowed_for_new_user":"క్షమించాలి. కొత్త సభ్యులు జోడింపులు ఎగుమతి చేయలేరు.","attachment_download_requires_login":"క్షమించాలి. జోడింపులు దిగుమతి చేసుకోవడానికి మీరు లాగిన్ అయి ఉండాలి."},"abandon":{"confirm":"మీరు నిజంగానే మీ టపాను వదిలేద్దామనుకుంటున్నారా?","no_value":"లేదు, ఉంచండి","yes_value":"అవును. వదిలేయండి"},"via_email":"ఈ టపా ఈమెయిల్ ద్వారా వచ్చింది","wiki":{"about":"ఈ టపా వికీ: ప్రాథమిక సభ్యులు దీన్ని సవరించలేరు"},"archetypes":{"save":"భద్రపరుచు ఐచ్చికాలు"},"controls":{"reply":"ఈ టపాకు జవాబు రాయుట మొదలుపెట్టండి","like":"ఈ టపాను ఇష్టపడు","has_liked":"మీరు ఈ టపాను ఇష్టపడ్డారు","undo_like":"ఇష్టాన్ని రద్దుచేయి","edit":"ఈ టపాను సవరించు","edit_anonymous":"క్షమించాలి. ఈ టపాను సవరించడానికి మీరు లాగిన్ అయి ఉండాలి. ","flag":"దృష్టికొరకు ఈ టపాను ప్రైవేటుగా కేతనించు లేదా దీని గురించి ప్రైవేటు ప్రకటన పంపు","delete":"ఈ టపాను తొలగించు","undelete":"ఈ టపాను పునస్తాపించు","share":"ఈ టపా లంకెను పంచు","more":"మరింత","delete_replies":{"confirm":{"one":"ఈ టపా యొక్క నేరు జవాబు కూడా తొలగించాలనుకుంటున్నారా?","other":"ఈ టపా యొక్క {{count}} నేరు జవాబులు కూడా తొలగించాలనుకుంటున్నారా?"},"yes_value":"అవును, జవాబులు కూడా తొలగించు.","no_value":"లేదు, కేవలం ఈ టపానే"},"admin":"టపా అధికారి చర్యలు","wiki":"వికీ చేయి","unwiki":"వికీ తొలగించు","convert_to_moderator":"సిబ్బంది రంగు కలుపు","revert_to_regular":"సిబ్బంది రంగు తొలగించు","rebake":"హెచే టీ యం యల్ పునర్నిర్మించు","unhide":"చూపు"},"actions":{"flag":"కేతనం","defer_flags":{"one":"కేతనం వాయిదావేయి","other":"కేతనాలు వాయిదావేయి"},"it_too":{"off_topic":"దీన్ని కూడా కేతనించు","spam":"దీన్ని కూడా కేతనించు","inappropriate":"దీన్ని కూడా కేతనించు","custom_flag":"దీన్ని కూడా కేతనించు","bookmark":"దీన్ని కూడా పేజీకించు","like":"దీన్ని కూడా ఇష్టపడు","vote":"దీనికి కూడా ఓటు వేయి"},"undo":{"off_topic":"కేతనం రద్దు","spam":"కేతనం రద్దు","inappropriate":"కేతనం రద్దు","bookmark":"పేజీక రద్దు","like":"ఇష్టం రద్దు","vote":"ఓటు రద్దు"},"people":{"off_topic":"{{icons}} దీన్ని విషయాంతరంగా కేతనించాయి","spam":"{{icons}} దీన్ని స్పాముగా కేతనించాయి","spam_with_url":"{{ప్రతీకలు}} స్పామ్ లా \u003ca href='{{postUrl}}'\u003eకేతనించు\u003c/a\u003e","inappropriate":"{{icons}} దీన్ని అసమంజసంగా కేతనించాయి","notify_moderators":"{{icons}} దీన్ని నిర్వాహకుల దృష్టికి తెచ్చాయి","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eనిర్వాహకుల దృష్టికి తెచ్చారు\u003c/a\u003e","bookmark":"{{icons}} పేజీక ఉంచారు","like":"{{icons}} ఇష్టపడ్డారు","vote":"{{icons}}  దీనికి ఓటు వేసారు"},"by_you":{"off_topic":"మీరు దీన్ని విషయాంతరంగా కేతనించారు","spam":"మీరు దీన్ని స్పాముగా కేతనించారు","inappropriate":"మీరు దీన్ని అసమంజసంగా కేతనించారు","notify_moderators":"మీరు దీన్ని నిర్వాహకుల దృష్టికి తెచ్చారు","bookmark":"మీరు దీనికి పేజీక ఉంచారు","like":"మీరు దీన్ని ఇష్టపడ్డారు","vote":"మీరు ఈ టపాకు ఓటు వేశారు"},"by_you_and_others":{"off_topic":{"one":"మీరు మరియు ఇంకొకరు దీన్ని విషయాంతరంగా కేతనించారు. ","other":"మీరు మరియు [[count]] ఇతర జనులు దీన్ని విషయాంతరంగా కేతనించారు. "},"spam":{"one":"మీరు మరియు ఇంకొకరు దీన్ని స్పాముగా కేతనించారు. ","other":"మీరు మరియు [[count]] ఇతర జనులు దీన్ని స్పాముగా కేతనించారు. "},"inappropriate":{"one":"మీరు మరియు ఇంకొకరు దీన్ని అసమంజసమైనదిగా కేతనించారు. ","other":"మీరు మరియు [[count]] ఇతర జనులు దీన్ని అసమంజసమైనదిగా కేతనించారు. "},"notify_moderators":{"one":"మీరు మరియు ఇంకొకరు దీన్ని నిర్వాహకుల దృష్టికి తెచ్చారు.","other":"మీరు మరియు [[count]] ఇతర జనులు దీన్ని నిర్వాహకుల దృష్టికి తెచ్చారు."},"bookmark":{"one":"మీరు మరియు ఇంకొకరు దీనికి పేజీక ఉంచారు.","other":"మీరు మరియు {{count}} ఇతరులు దీనికి పేజీక ఉంచారు."},"like":{"one":"మీరు మరొకరు దీన్ని ఇష్టపడ్డారు","other":"మీరు మరియు {{count}} గురు దీన్ని ఇష్టపడ్డారు"},"vote":{"one":"మీరు మరియొకరు ఈ టపాకు వోటు వేసారు","other":"మీరు మరియు {{count}} గురు ఈ టపాకు ఓటు వేసారు."}},"by_others":{"off_topic":{"one":"ఒకరు దీన్ని విషయాంతరంగా కేతనించారు","other":"{{count}} గురు దీన్ని విషయాంతరంగా కేతనించారు"},"spam":{"one":"ఒకరు దీన్ని స్పాముగా కేతనించారు","other":"{{count}} గురు దీన్ని స్పాముగా కేతనించారు"},"inappropriate":{"one":"ఒకరు దీన్ని అసమంజసంగా కేతనించారు","other":"{{count}} గురు దీన్ని అసమంజసంగా కేతనించారు"},"notify_moderators":{"one":"ఒకరు దీన్ని నిర్వాహకుల దృష్టికి తెచ్చారు","other":"{{count}} గురు దీన్ని నిర్వాహకుల దృష్టికి తెచ్చారు"},"bookmark":{"one":"ఒకరు ఈ టపాకు పేజీక ఉంచారు","other":"{{count}} గురు ఈ విషయానికి పేజీక ఉంచారు"},"like":{"one":"ఒకరు దీన్ని ఇష్టపడ్డారు","other":"{{count}} గురు దీన్నిఇష్టపడ్డారు."},"vote":{"one":"ఒకరు దీనికి ఓటు వేశారు","other":"{{count}} గురు దీనికి ఓటు వేసారు"}}},"delete":{"confirm":{"one":"మీరు నిజ్జంగా ఈ టపాను తొలగించాలనుకుంటున్నారా?","other":"మీరు నిజ్జంగానే ఈ టపాలన్నీ తొలగించాలనుకుంటున్నారా?"}},"revisions":{"controls":{"first":"తొలి దిద్దుబాటు","previous":"గత దిద్దుబాటు","next":"తరువాతి దిద్దుబాటు","last":"చివరి దిద్దుబాటు","hide":"దిద్దుబాటు దాచు","show":"దిద్దుబాటు చూపు"},"displays":{"inline":{"title":"వ్యవకలనాలు మరియు సంకలనాలను సాలు మధ్యలో చూపుతూ మొత్తం చూపు","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e హెచ్ టీ యం టల్"},"side_by_side":{"title":"పక్క పక్కన తేడాలు చూపుతూ మొత్తం చూపు","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e హెచ్ టీయంయల్"},"side_by_side_markdown":{"title":"ముడి మూల తేడాను పక్కపక్కన చూపు","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e ముడి"}}}},"category":{"can":"can\u0026hellip;","none":"(ఏ వర్గం లేదు)","choose":"వర్గం ఎంచుకో\u0026hellip;","edit":"సవరించు","edit_long":"సవరించు","view":"ఈ వర్గంలోని విషయాలు చూడు","general":"సాధారణ","settings":"అమరికలు","delete":"వర్గం తొలగించు","create":"కొత్త వర్గం","save":"వర్గం దాచు","slug":"వర్గం స్లగ్","slug_placeholder":"(ఐచ్చికం) వెబ్ చిరునామాలో పేరు డాష్ లతో","creation_error":"ఈ వర్గం సృష్టించేప్పుడు దోషం","save_error":"ఈ వర్గం భద్రపరిచేప్పుడు దోషం","name":"వర్గం పేరు","description":"వివరణ","topic":"వర్గం విషయం","logo":"వర్గం లోగో బొమ్మ","background_image":"వర్గం వెనుతలపు బొమ్మ","badge_colors":"బ్యాడ్జి రంగులు","background_color":"వెనుతలపు రంగు","foreground_color":"మునుతలపు రంగు","name_placeholder":"గరిష్టం ఒకటి లేదా రెండు పదాలు","color_placeholder":"ఏదేనీ జాల రంగు","delete_confirm":"మీరు నిజంగా ఈ వర్గాన్ని తొలగించాలనుకుంటున్నారా?","delete_error":"ఈ వర్గం తొలగించేప్పుడు దొషం.","list":"వర్గాల జాబితా చూపు","no_description":"ఈ వర్గానికి వివరణ రాయండి","change_in_category_topic":"వివరణ సవరించు","already_used":"ఈ రంగు వేరే వర్గం వాడింది","security":"సంరక్షణ","images":"బొమ్మలు","auto_close_label":"ఇంత కాలం తర్వాత ఈ విషయం స్వీయ మూయు:","auto_close_units":"గంటలు","email_in":"అనురూప లోపలికి వచ్చే ఈమెయిల్ చిరునామా:","email_in_allow_strangers":"ఎటువంటి ఖాతాలు లేని అనామక సభ్యుల నుండి వచ్చే ఈమెయిల్లు అంగీకరించు","email_in_disabled":"సైటు అమరికల్లో ఈమెయిల్ ద్వారా కొత్త విషయాలు రాయుడ అచేతనమైంది. ఈమెయిల్ ద్వారా కొత్త విషయాలు రాయుట చేతనం చేయుటకు,","email_in_disabled_click":"\"ఈమెయిల్ ఇన్\" అమరికను చేతనం చేయి.","allow_badges_label":"ఈ వర్గంలో బ్యాడ్జిలు బహూకరించుట అనుమతించు","edit_permissions":"అనుమతులు సవరించు","add_permission":"అనుమతి కలుపు","this_year":"ఈ సంవత్సరం","position":"స్థానం","default_position":"అప్రమేయ స్థానం","position_disabled":"వర్గాలు కలాపం వరుసలో చూపబడతాయి. జాబితాల్లో వర్గాల వరుసను నియంత్రించడానికి,","position_disabled_click":"\"స్థిర వర్గ స్థాయిలు\" అమరికను చేతనం చేయండి","parent":"తండ్రి వర్గం","notifications":{"watching":{"title":"కన్నేసారు"},"tracking":{"title":"గమనిస్తున్నారు"},"muted":{"title":"నిశ్శబ్దం"}}},"flagging":{"title":"మా కమ్యునిటీని నాగరికంగా ఉంచుటలో సహాయానికి ధన్యవాదములు","private_reminder":"కేతనాలు ప్రైవేటు. \u003cb\u003eకేవలం\u003c/b\u003e సిబ్బందికి మాత్రమే కనిపిస్తాయి","action":"టపాను కేతనించు","take_action":"చర్య తీసుకో","delete_spammer":"స్పామరును తొలగించు","delete_confirm":"మీరు ఈ వినియోగదారుని \u003cb\u003e%{టపాలు}\u003c/b\u003e టపాలు మరియు \u003cb\u003e%{విషయాలు}\u003c/b\u003e విషయాలు తొలగించబోతున్నారు, వారి ఖాతా తొలగించి,వారి IP అడ్రస్ నుండి సైన్‌అప్‌లు మూసివేయండి\u003cb\u003e%{ip_అడ్రస్}\u003c/b\u003e, మరియు శాశ్వత మూసివేత జాబితాకి వారి ఈ-మెయిల్ అడ్రస్ \u003cb\u003e%{ఈ-మెయిల్}\u003c/b\u003e ని కలపండి.మీరు నిజంగా ఈ వినియోగదారుని స్పామర్ గా భావిస్తున్నారా ?","yes_delete_spammer":"అవులు, స్పామరును తొలగించు","ip_address_missing":"వర్తించదు","hidden_email_address":"(దాయబడింది)","submit_tooltip":"ఒక ప్రైవేటు కేతనం అందించు","take_action_tooltip":"మరిన్ని కమ్యునిటీ కేతనాల కోసం ఎదురు చూడకుండా ఇప్పుడే కేతన గట్టు చేరు","cant":"క్షమించాలి. ఇప్పుడు ఈ టపాను కేతనిచంలేరు.","formatted_name":{"off_topic":"ఇది విషయాంతరం","inappropriate":"ఇది అసమంజసం","spam":"ఇది స్పాము"},"custom_placeholder_notify_user":"నిక్కచ్చిగా ఉండు, నిర్మాణాత్మకంగా ఉండు మరియు ఎల్లప్పుడూ దయతో ఉండు","custom_placeholder_notify_moderators":"మీరు ఏ విషయంలో ఇబ్బందిపడుతున్నారో మాకు తెలియజేయండి. ఉదాహరణలు, లంకెలు మరియు సంబంధిత సమాచారం పొందుపరచండి. ","custom_message":{"at_least":"కనీసం {{n}} అక్షరాలు రాయండి","more":"{{n}} కావాలి...","left":"{{n}} ఉన్నాయి"}},"flagging_topic":{"title":"మా కమ్యునిటీని నాగరికంగా ఉంచుటలో సహాయానికి ధన్యవాదములు!","action":"విషయాన్ని కేతనించు"},"topic_map":{"title":"విషయ సారం","links_shown":"అన్ని {{totalLinks}} లంకెలూ చూపు...","clicks":{"one":"ఒక నొక్కు","other":"%{count} నొక్కులు"}},"topic_statuses":{"warning":{"help":"ఇది అధికారిక హెచ్చరిక"},"bookmarked":{"help":"ఈ విషయానికి పేజీక ఉంచారు"},"locked":{"help":"ఈ విషయం ముగిసింది. కొత్త జవాబులు అంగీకరించదు. "},"archived":{"help":"ఈ విషయం కట్టకట్టబడింది. ఇది గడ్డకట్టుకుంది ఇహ మార్చయిత కాదు"},"unpinned":{"title":"అగ్గుచ్చిన","help":"ఈ విషయం మీకు అగ్గుచ్చబడింది. ఇది ఇహ క్రమ వరుసలోనే కనిపిస్తుంది"},"pinned_globally":{"title":"సార్వత్రికంగా గుచ్చారు"},"pinned":{"title":"గుచ్చారు","help":"ఈ విషయం మీకు గుచ్చబడింది. దాని వర్గంలో అది అగ్రభాగాన కనిపిస్తుంది."},"invisible":{"help":"ఈ విషయం జాబితాలనుండి తొలగించబడింది. ఇహ కేవలం నేరు లంకె ద్వారా మాత్రమే చూడగలరు."}},"posts":"టపాలు","posts_lowercase":"టపాలు","posts_long":"ఈ విషయానికి {{number}}  టపాలు ఉన్నాయి. ","original_post":"మూల టపా","views":"చూపులు","replies":"జవాబులు","views_long":"ఈ విషయం  {{number}}  సార్లు చూడబడింది.","activity":"కలాపం","likes":"ఇష్టాలు","likes_long":"ఈ విషయానికి  {{number}}  ఇష్టాలు ఉన్నాయి","users":"సభ్యులు","category_title":"వర్గం","history":"చరిత్ర","changed_by":" {{author}} రాసిన","raw_email":{"title":"ముడి ఈమెయిల్","not_available":"అందుబాటులో లేదు!"},"categories_list":"వర్గాల జాబితా","filters":{"with_topics":"%{filter} విషయాలు","with_category":"%{filter} %{category} విషయాలు","latest":{"help":"ఇటీవలి టపాలతోని విషయాలు"},"hot":{"title":"వేడివేడి","help":"ఎంపికైన వేడివేడి విషయాలు"},"read":{"title":"చదివిన","help":"మీరు చదివిన విషయాలు, మీరు చివరిసారి చదివిన వరుసలో"},"categories":{"title":"వర్గాలు","title_in":"వర్గం - {{categoryName}}","help":"వర్గాల వారీగా జట్టు కట్టిన అన్ని విషయాలూ"},"unread":{"help":"మీరు ప్రస్తుతం కన్నేసిన లేదా గమనిస్తున్న చదవని టపాలతో ఉన్న  విషయాలు "},"new":{"lower_title":"కొత్త","help":"గత కొద్ది రోజులలో సృష్టించిన టపాలు"},"posted":{"title":"నా టపాలు","help":"మీరు టపా రాసిన విషయాలు"},"bookmarks":{"title":"పేజీకలు","help":"మీరు పేజీక ఉంచిన విషయాలు"},"category":{"help":"{{categoryName}} వర్గంలోని కొత్త విషయాలు"},"top":{"title":"అగ్ర","help":"గత సంవత్సరం, నెల, వారం లేదా రోజులోని అత్యంత క్రియాశీల విషయాలు","today":"ఈ రోజు"}},"browser_update":"దురదృష్టవశాత్తు, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eఈ సైట్ లో పనిచేయడానికి మీ బ్రౌజర్ చాలా పాతది \u003c/a\u003e. దయచేసి \u003ca href=\"http://browsehappy.com\"\u003eమీ బ్రౌజర్ ని నవీకరించండి\u003c/a\u003e.","permission_types":{"full":"సృష్టించి / జవాబివ్వు / చూడు","create_post":"జవాబివ్వు / చూడు","readonly":"చూడు"},"docker":{"upgrade":"మీ డిస్కోర్సు ప్రతిష్టాపన కాలాతీతమైంది.","perform_upgrade":"ఉన్నతీకరించడానికి ఇక్కడ నొక్కండి"},"type_to_filter":"జల్లించుటకు రాయి...","admin":{"title":"డిస్కోర్సు అధికారి","moderator":"నిర్వాహకుడు","dashboard":{"title":"రంగస్థలం","last_updated":"రంగస్థలం చివరగా నవీకరించినది:","version":"రూపాంతరం","up_to_date":"మీరు తాజాగా ఉన్నారు! ","critical_available":"ఒక క్రిటికల్ ఉన్నతీకరణ అందుబాటులో ఉంది.","updates_available":"ఉన్నతీకరణలు అందుబాటులో ఉన్నాయి.","please_upgrade":"దయచేసి ఉన్నతీకరించు!","no_check_performed":"ఉన్నతీకరణల కోసం పరికింపు జరగలేదు. sidekiq నడుస్తున్నట్టు సరిచూడండి.","stale_data":"ఉన్నతీకరణల కోసం పరికింపు జరగలేదు. sidekiq నడుస్తున్నట్టు సరిచూడండి.","version_check_pending":"మీరు ఇటీవలే ఉన్నతీకరించినట్టున్నారు. అద్భుతం!","installed_version":"ప్రతిష్టించబడింది","latest_version":"తాజా","problems_found":"మీ డిస్కోర్సు ప్రతిష్టాపనతో కొన్ని సమస్యలు కనిపించాయి.","last_checked":"చివరగా సరిచూసినది","refresh_problems":"తాజాపరుచు","no_problems":"ఎటువంటి సమస్యలూ కనిపించలేదు","moderators":"నిర్వాహకులు:","admins":"అధికారులు:","blocked":"నిలిపిన:","suspended":"సస్పెండయిన:","space_free":"{{size}} ఖాలీ","uploads":"ఎగుమతులు","backups":"బ్యాకప్లు","traffic_short":"ట్రాఫిక్","traffic":"అనువర్తన జాల రిక్వెస్టులు","page_views":"API అభ్యర్ధనలు","page_views_short":"API అభ్యర్ధనలు","show_traffic_report":"సవివరణ ట్రాఫిక్ రిపోర్టు చూపు","reports":{"today":"ఈరోజు","yesterday":"నిన్న","last_7_days":"చివరి ఏడు రోజులు","last_30_days":"చివరి ముప్పై రోజులు","all_time":"ఆల్ టైమ్","7_days_ago":"ఏడు రోజుల క్రితం","30_days_ago":"ముప్పై రోజుల క్రితం","all":"అన్ని","view_table":"టేబుల్","view_chart":"బార్ పట్టిక","refresh_report":"రిపోర్టు తాజాపరుచు","start_date":"ఆరంభ తేదీ","end_date":"ముగింపు తేదీ"}},"commits":{"latest_changes":"తాజా మార్పులు: దయచేసి తరచూ ఉన్నతీకరించండి!","by":"నుండి"},"flags":{"title":"కేతనాలు","old":"పాత","active":"చేతన","agree":"ఒప్పుకోండి","agree_title":"ఈ కేతనం సరైనదిగా చెప్పండి","agree_flag_modal_title":"ఒప్పుకొను మరియు","agree_flag_hide_post":"ఒప్పుకొని (టపా దాచు మరియు ప్రైవేటు సందేశం పంపు)","agree_flag_restore_post":"ఒప్పుకొను (టపా పునస్తాపించు)","agree_flag_restore_post_title":"ఈ టపా పునస్తాపించు","agree_flag":"కేతనంతో ఒప్పుకో","agree_flag_title":"కేతనంతో ఒప్పుకో మరియు టపాను మార్చకుండా ఉంచు","defer_flag":"వాయిదావేయి","defer_flag_title":"ఈ కేతనం తొలగించు; ఇప్పుడు ఎటువంటి చర్య అవసరంలేదు.","delete":"తొలగించు","delete_title":"ఈ కేతనం వర్తించే టపా తొలగించు","delete_post_defer_flag":"టపా తొలగించు మరియు కేతనం వాయిదా వేయి","delete_post_defer_flag_title":"టపా తొలగించు; ఇదే తొలి టపా అయితే ఈ విషయాన్ని తొలగించు","delete_post_agree_flag":"టపా తొలగించు మరియు కేతనంతో అంగీకరించు","delete_post_agree_flag_title":"టపా తొలగించు; తొలగి టపా అయితే, విషయాన్ని కూడా తొలగించు","delete_flag_modal_title":"తొలగించు మరియు...","delete_spammer":"స్పామరును తొలగించు","delete_spammer_title":"ఈ సభ్యుడిని తొలగించు మరియు ఇతని అన్ని టపాలు, విషయాలూ కూడా తొలగించు. ","disagree_flag_unhide_post":"ఒప్పుకోకు (టపా దాచు)","disagree_flag_unhide_post_title":"ఈ టపాకు ఉన్న అన్ని కేతనాలూ తొలగించు మరియు టపాను మరలా సందర్శనీయం చేయి","disagree_flag":"ఒప్పుకోకు","disagree_flag_title":"ఈ కేతనాన్ని చెల్లనిదిగా లేదా తప్పుగా  నిరాకరించు","clear_topic_flags":"ముగిసింది","clear_topic_flags_title":"ఈ విషయం పరిశీలించబడింది మరియు అన్ని సమస్యలూ సరిచేయబడ్డాయి. ముగిసింది నొక్కి అన్ని కేతనాలూ తొలగించు.","more":"(మరిన్ని జవాబులు...)","dispositions":{"agreed":"ఒప్పుకున్నారు","disagreed":"ఒప్పుకోలేదు","deferred":"వాయిదా వేసారు"},"flagged_by":"కేతనించినవారు","resolved_by":"సరిచేసినవారు","took_action":"చర్య తీసుకున్నారు","system":"వ్యవస్థ","error":"ఏదే తేడా జరిగింది","reply_message":"జవాబు","no_results":"ఎట్టి కేతనాలూ లేవు","topic_flagged":"ఈ \u003cstrong\u003eవిషయం\u003c/strong\u003e కేతనించబడింది.","visit_topic":"చర్య తీసుకోడానికి విషయం దర్శించు","was_edited":"తొలి కేతనం తర్వాత టపా సవరించబడింది","previous_flags_count":"ఈ టపా ఇప్పటికే {{count}}  కేతనించబడింది.","summary":{"action_type_3":{"one":"విషయాంతరం","other":"విషయాంతరం x{{count}}"},"action_type_4":{"one":"అసమంజసం ","other":"అసమంజసం x{{count}}"},"action_type_6":{"one":"అనురూపం","other":"అనురూప x{{count}}"},"action_type_7":{"one":"అనురూపం","other":"అనురూపం x{{count}}"},"action_type_8":{"one":"స్పాము","other":"స్పామ్ x{{count}}"}}},"groups":{"primary":"ప్రాథమిక గుంపు","no_primary":"(ప్రాథమిక గుంపు లేదు)","title":"గుంపులు","edit":"గుంపులు సవరించు","refresh":"తాజా పరుచు","new":"కొత్త","selector_placeholder":"సభ్యనామం రాయండి","name_placeholder":"గంపు పేరు, జాగా లేకుండా, సభ్యనామం వలె","about":"మీ గుంపు మెంబర్షిప్పు మరియు పేర్లు ఇక్కడ సవరించండి","group_members":"గుంపు సభ్యులు","delete":"తొలగించు","delete_confirm":"ఈ గుంపును తొలగించాలనుకుంటున్నారా? ","delete_failed":"గుంపును తొలగించలేకున్నాము. ఇది స్వీయ గుంపు అయితే దీన్ని నాశనం చేయలేరు.","delete_member_confirm":" '%{group}' గుంపు నుండి '%{username}' ను తొలగించాలా?","name":"పేరు","add":"కలుపు","add_members":"సభ్యులను కలుపు","automatic_membership_email_domains":"వినియోగదారుడు ఏ ఈ-మెయిల్ డొమైన్ తో నమోదు చేసుకున్నాడో అది ఖచ్చితంగా  ఈ జాబితాలో ఒక దానిని పోలి స్వయంసిధ్ధంగా గ్రూప్ కి కలుస్తాయి:","automatic_membership_retroactive":"ఇప్పటికే నమోదిత వినియోగదారులను జోడించడానికి అదే ఇమెయిల్ డొమైన్ రూల్ వర్తిస్తుంది"},"api":{"generate_master":"మాస్టరు ఏపీఐ కీ ఉత్తపత్తించు","none":"ప్రస్తుతం చేతన ఏపీఐ కీలు లేవు.","user":"సభ్యుడు","title":"ఏపీఐ","key":"ఏపీఐ కీ","generate":"ఉత్పత్తించు","regenerate":"పునరుత్పత్తించు","revoke":"రివోక్","confirm_regen":"మీరు నిజంగా పాత ఏపీఐ కీని కొత్త దానితో రీప్లేస్ చెయ్యాలనుకుంటున్నారా?","confirm_revoke":"మీరు నిజంగా ఆ కీని రివోకే చెయ్యాలనుకుంటున్నారా? ","info_html":"మీ ఏపీఐ కీ జేసన్ వాడి విషయాలు సృష్టించుట, ఉన్నతీకరించుటకు దోహదం చేస్తుంది.","all_users":"అందరు సభ్యులు","note_html":"ఈ కీ ని \u003cstrong\u003e రహస్యంగా ఉంచండి \u003c/strong\u003e, అది కలిగివున్న అందరూ వినియోగదారులు ఏ వినియోగదారునిలా నైనా ఏకపక్ష టపాలు సృష్టించవచ్చు."},"plugins":{"title":"చొప్పింతలు","installed":"ప్రతిష్టించిన చొప్పింతలు","name":"పేరు","none_installed":"ఎటువంటి చొప్పింతలు ప్రతిష్టించిలేవు.","version":"సంచిక","change_settings":"అమరికలు మార్చు","howto":"పొడిగింతలు నేను ఎలా ప్రతిష్టించగలను?"},"backups":{"title":"బ్యాకప్పులు","menu":{"backups":"బ్యాకప్పులు","logs":"లాగ్స్"},"none":"ఎట్టి బ్యాకప్పులూ లేవు","read_only":{"enable":{"title":"కేవలం చదివే రీతే చేతనం చేయి","confirm":"మీరు నిజంగా కేవలం చదివే రీతి చేతనంచేయాలనుకుంటున్నారా?"},"disable":{"title":"కేవలం చదివే రీతి అచేతనం చేయి"}},"logs":{"none":"ఇంకా లాగులు లేవు..."},"columns":{"filename":"దస్త్రం పేరు","size":"పరిమాణం"},"upload":{"uploading":"ఎగుమతవుతోంది...","success":"'{{filename}}' విజయవంతంగా ఎగుమతయింది.","error":"'{{filename}}' ఎగుమతించుటలో దోషం: {{message}}"},"operations":{"is_running":"ఒక కార్యం ప్రస్తుతం నడుస్తోంది...","failed":"కార్యం విఫలమైంది. దయచేసి లాగులు చూడండి.","cancel":{"title":"ప్రస్తుత కార్యం రద్దుచేయి","confirm":"మీరు నిజంగానే ప్రస్తుత కార్యం రద్దుచేయాలనుకుంటున్నారా?"},"backup":{"title":"బ్యాకప్ సృష్టించు","confirm":"మీరు కొత్త బ్యాకప్ మొదలుపెట్టాలనుకుంటున్నారా?","without_uploads":"అవులు (దస్త్రాలు కాకుండా)"},"download":{"title":"బ్యాకప్ దిగుమతించు"},"destroy":{"title":"బ్యాకప్ తొలగించు","confirm":"మీరు నిజంగానే బ్యాకప్ ను నాశనం చేయాలనుకుంటున్నారా?"},"restore":{"is_disabled":"సైటు అమరికల్లో రీస్టోరు అచేతనమైంది. ","title":"బ్యాకప్ ను రీస్టోరు చేయి","confirm":"మీరు నిజంగానే ఈ బ్యాకప్ ను రీస్టోరు చేయాలనుకుంటున్నారా?"},"rollback":{"title":"డాటాబేసును గత పనిచేసే స్థితికి రోల్ బ్యాక్ చేయి","confirm":"మీరు నిజంగానే డాటాబేసును గత పనిచేసే స్థితికి రోల్ బ్యాక్ చేయాలనుకుంటున్నారా?"}}},"export_csv":{"user_archive_confirm":"మీరు నిజంగా మీ టపాల దిగుమతి కోరుకుంటున్నారా ?","failed":"ఎగుమతి విఫలమైంది. దయచేసి లాగులు చూడంది. ","rate_limit_error":"టపాలు కేవలం రోజుకు ఒకసారి మాత్రమే దిగుమతించుకోగలరు. దయచేసి రేపు ప్రయత్నించండి.","button_text":"ఎగుమతి","button_title":{"user":"పూర్తి సభ్యుల జాబితా సీయస్వీ రూపులో ఎగుమతించండి","staff_action":"పూర్తి సిబ్బంది చర్యా లాగు సీయస్వీ రూపులో ఎగుమతించండి.","screened_email":"వడకట్టిన ఈమెయిల్ల పూర్తి జాబితా సీయస్వీ రూపులో ఎగుమతించు","screened_ip":"వడకట్టిన ఐపీల పూర్తి జాబితా సియస్వీ రూపులో ఎగుమతించు","screened_url":"వడకట్టిన యూఆర్ యల్ల పూర్తి జాబితాను సీయస్వీ రూపులో ఎగుమతించు"}},"invite":{"button_text":"ఆహ్వానాలు పంపు","button_title":"ఆహ్వానాలు పంపు"},"customize":{"title":"కస్టమైజ్","long_title":"సైట్ కస్టమైజేషనులు","css":"సీయస్ యస్","header":"హెడర్","top":"అగ్ర","footer":"ఫుటరు","head_tag":{"text":"\u003c/head\u003e","title":"\u003c/head\u003e కొస ముందు ఉంచే హెచ్ టీ యం యల్"},"body_tag":{"text":"\u003c/body\u003e","title":"\u003c/body\u003e కొస ముందు ఉంచే హెచ్ టీ యం యల్"},"override_default":"స్టాండర్డ్ సైల్ షీట్ ఉంచకు","enabled":"చేతమైందా?","preview":"మునుజూపు","undo_preview":"మునుజూపు తొలగించు","rescue_preview":"అప్రమేయ స్టైలు","explain_preview":"సైటును అనురూప స్టైల్షీటుతో దర్శించు","explain_undo_preview":"ప్రస్తుతం చేతనం చేసిఉన్న కస్టమ్ స్టైల్ షీటుకు మరలు","explain_rescue_preview":"సైటును అప్రమేయ స్టైల్ షీటుతో చూడు","save":"భద్రపరుచు","new":"కొత్త","new_style":"కొత్త స్టైలు","delete":"తొలగించు","delete_confirm":"ఈ కస్టమైజేషనులు తొలగించు? ","about":"సైట్లో CSS స్టైల్‌షీట్స్ and HTML హెడర్స్ మార్చండి.స్టార్ట్‌కి కస్టమైజేషన్ కలపండి.","color":"రంగు","opacity":"అపారదర్శకత","copy":"నకలు","css_html":{"title":"సీయస్ యస్ / హెచ్ టీ యం యల్","long_title":"సీ యస్ యస్ మరియు హెచ్ టీ యం యల్ కస్టమైజేషనులు"},"colors":{"title":"రంగులు","long_title":"రంగు స్కీములు","about":"సైట్లో వాడే రంగులు CSS వ్రాయకుండా మార్చండి.స్కీమ్ ను స్టార్ట్ కు కలపండి.","new_name":"కొత్త రంగు స్కీము","copy_name_prefix":"దీనికి నకలు","delete_confirm":"ఈ రంగు స్కీము తొలగించు?","undo":"రద్దు","undo_title":"చివరిసారి భధ్రపరచినప్పటి నుండి మీ రంగుల మార్పులు తిరగదోడండి.","revert":"తిద్దు","revert_title":"డిస్కోర్సు అప్రమేయ రంగు స్కీముకు రంగులను రీసెట్ చేయి","primary":{"name":"ప్రాథమిక","description":"పాఠ్యం, చిహ్నాలు మరియు సరిహద్దులు."},"secondary":{"name":"ద్వితీయ","description":"ప్రధాన వెనుతలం రంగు మరియు కొన్ని మీటల పాఠ్యం రంగు."},"tertiary":{"name":"తృతీయ","description":"లంకెలు, కొన్ని మీటలు, ప్రకటనలు, మరియు ఎసెంట్ రంగు."},"quaternary":{"name":"చతుర్థీ","description":"నావిగేషను లంకెలు"},"header_background":{"name":"హెడరు వెనుతలం","description":"సైటు హెడరు వెనుతలం రంగు."},"header_primary":{"name":"హెడరు ప్రాథమిక","description":"సైటు హెడరు పాఠ్యం మరియు చిహ్నాలు"},"highlight":{"name":"హైలైట్","description":"ఒక పుటలో వెనుతల రంగు ప్రత్యేకతగా కల్గిన అంశాలు, టపాలు మరియు విషయాలు అయి ఉంటాయి."},"danger":{"name":"ప్రమాదం","description":"తొలగించిన టపాలు మరియు విషయాల వంటి చర్యలకు రంగులు అద్దారు."},"success":{"name":"విజయం","description":"ఒక చర్య విజయవంతమైందని చూపడానికి వాడబడేది"},"love":{"name":"ప్రేమ","description":"ఇష్ఠ బటను రంగు."},"wiki":{"name":"వికీ","description":"వికీ టపాలు వెనుతలంకు ప్రాథమిక రంగు"}}},"email":{"title":"ఈమెయిల్","settings":"అమరికలు","all":"అన్నీ","sending_test":"పరీక్షా ఈమెయిల్ పంపుతున్నామ్...","error":"\u003cb\u003eదోషం\u003c/b\u003e - %{server_error}","test_error":"టెస్ట్ మెయిల్ పంపడంలో  ఒక సమస్య ఉంది.దయచేసి మీ మెయిల్ సెట్టింగ్స్ రెండోసారి తనిఖీ చేసి,మీ హోస్ట్ మెయిల్ కనెక్షన్ నిరోధించుటలేదని నిర్ధారించుకోండి, మరియు తిరిగి ప్రయత్నించండి.","sent":"పంపిన","skipped":"వదిలిన","sent_at":"వద్ద పంపారు","time":"కాలం","user":"సభ్యుడు","email_type":"ఈమెయిల్ టైపు","to_address":"చిరునామాకు","test_email_address":"పరీక్షించుటు ఈమెయిల్ ","send_test":"పరీక్షా  మెయిల్ పంపారు","sent_test":"పంపారు!","delivery_method":"డెలివరీ పద్దతి","preview_digest":"డైజెస్టు మునుజూపు","refresh":"తాజాపరుచు","format":"రూపు","html":"హెచ్ టీయంయల్","text":"పాఠ్యం","last_seen_user":"చివరగా చూసిన సభ్యుడు:","reply_key":"జవాబు కీ","skipped_reason":"వదిలిన కారణం","logs":{"none":"ఎట్టి లాగులు కనిపించలేదు","filters":{"title":"జల్లెడ","user_placeholder":"సభ్యనామం","address_placeholder":"name@example.com","type_placeholder":"డైజెస్ట్, సైనప్...","reply_key_placeholder":"జవాబు కీ","skipped_reason_placeholder":"కారణం"}}},"logs":{"title":"లాగులు","action":"చర్య","created_at":"సృష్టించినది","last_match_at":"చివరగా జతైనది","match_count":"సరిపోతుంది","ip_address":"ఐపీ","topic_id":"విషయపు ఐడీ","post_id":"టపా ఐడీ","delete":"తొలగించు","edit":"సవరణ","save":"భద్రపరుచు","screened_actions":{"block":"నిలుపు","do_nothing":"ఏమీ చేయకు"},"staff_actions":{"title":"సిబ్బింది చర్యలు","instructions":"వినియోగదారు పేరు మరియు చర్యల వడపోత చిట్టాను నొక్కండి.చిత్రాలు వినియోగదారు పుట కి వెళతాయి.","clear_filters":"మొత్తం చూపు","staff_user":"సిబ్బంది సభ్యుడు","target_user":"లక్షిత సభ్యుడు","subject":"సబ్జెక్టు","when":"ఎప్పుడు","context":"సందర్భం","details":"వివరాలు","previous_value":"గత","new_value":"కొత్త","diff":"తేడా","show":"చూపు","modal_title":"వివరాలు","no_previous":"గత విలువ లేదు","deleted":"కొత్త విలువ లేదు. రికార్డు తొలగించబడింది","actions":{"delete_user":"సభ్యుడిని తొలగించు","change_trust_level":"నమ్మకపు స్థాయి మార్చు","change_username":"సభ్యనామం మార్చు","change_site_setting":"సైటు అమరిక మార్చు","change_site_customization":"సైట్ కస్టమైజేషను మార్చు","delete_site_customization":"సైటు కస్టమైజేషను తొలగించు","suspend_user":"సభ్యుడిని సస్పెండు చేయి","unsuspend_user":"సస్పెండు కాని సభ్యుడు","grant_badge":"బ్యాడ్జ్ ఇవ్వు","revoke_badge":"బ్యాడ్జ్ తొలగించు","check_email":"ఈమెయిల్ చూడు","delete_topic":"విషయం తొలగించు","delete_post":"విషయం తొలగించు","impersonate":"పరకాయప్రవేశించు"}},"screened_emails":{"title":"స్క్రీన్ చేసిన ఈమెయిల్లు","email":"ఈమెయిల్ చిరునామా","actions":{"allow":"అనుమతించు"}},"screened_urls":{"title":"స్క్రీన్ చేసిన యూఆర్ యల్ లు","description":"ఇక్కడ టపాలో ఉపయోగించిన URLల జాబితా వినియోగదారులు స్పామర్లుగా గుర్తించారు.","url":"యూఆర్ యల్","domain":"డొమైన్"},"screened_ips":{"title":"స్క్రీన్ చేసిన ఐపీలు","description":"IP చిరునామాలు చూస్తారు.IP చిరునామాల \"అనుమతి\"లో మంచివరుస పాటించండి.","delete_confirm":"మీరు నిజంగా %{ip_address} కు ఈ నియమాన్ని తొలగించాలనుకుంటున్నారా? ","rolled_up_some_subnets":"IP నిషేధిత ప్రవేశాలు ఈ సబ్‌నెట్స్‌కు విజయవంతంగా చేర్చారు: %{subnets}.","rolled_up_no_subnet":"రోల్ అప్ చేయుటకు ఏమీ లేదు.","actions":{"block":"ఖండం","do_nothing":"అనుమతించు","allow_admin":"అధికారిని అనుమతించు"},"form":{"label":"కొత్త:","ip_address":"ఐపీ చిరునామా","add":"కలుపు","filter":"వెతుకు"},"roll_up":{"text":"రోల్ అప్","title":"కనీస ప్రవేశాలు ఉంటే కొత్త సబ్‌నెట్ నిషేధిత ప్రవేశాలు 'min_ban_entries_for_roll_up' సృష్టిస్తుంది."}},"logster":{"title":"దోష లాగులు"}},"impersonate":{"title":"పరకాయప్రవేశించు","help":"అనుకరించిన వినియోగదారుని ఖాతా దోషవిశ్లేషణ ప్రయోజనాలకు ఈ ఉపకరణం వినియోగించండి.పూర్తి అయిన తర్వాత మీరు లాగవుట్ చేయండి."},"users":{"title":"సభ్యులు","create":"అధికారి సభ్యుడిని కలుపు","last_emailed":"చివరగా ఈమెయిల్ చేసినది","not_found":"క్షమించాలి, ఆ సభ్యనామం మా వ్వవస్థలో లేదు.","id_not_found":"క్షమించాలి, ఆ సభ్య ఐడీ మా వ్యవస్థలో లేదు","active":"క్రియాశీల","show_emails":"ఈమెయిల్లు చూపు","nav":{"new":"కొత్త","active":"క్రియాశీల","pending":"పెండింగు","staff":"సిబ్బంది","suspended":"సస్పెడయ్యాడు","blocked":"నిలిపాడు","suspect":"అనుమానించు"},"approved":"అంగీకరించు","approved_selected":{"one":"సభ్యుడిని అంగీకరించు","other":"({{count}}) సభ్యులను అంగీకరించు"},"reject_selected":{"one":"సభ్యుడిని నిరాకరించు","other":"({{count}}) సభ్యులను నిరాకరించు"},"titles":{"active":"క్రియాశీల సభ్యులు","new":"కొత్త సభ్యులు","pending":"రివ్యూ పెండింగులో ఉన్న సభ్యులు","newuser":"నమ్మకం స్థాయి 0 సభ్యులు (కొత్త సభ్యుడు)","basic":"నమ్మకపు స్థాయి 1 వినియోగదారులు (ప్రాధమిక వినియోగదారు)","staff":"సిబ్బంది","admins":"అధికారి సభ్యులు","moderators":"నిర్వాహకులు","blocked":"నిలిపిన సభ్యులు","suspended":"సస్పెండయిన సభ్యులు","suspect":"అనుమానిత సభ్యులు"},"reject_successful":{"one":"వినియోగదారులు విజయవంతంగా ","other":"వినియోగదారులు విజయవంతంగా %{సంఖ్య} తిరస్కరింపబడ్డారు.."},"reject_failures":{"one":"వినియోగదారులు 1 ని తిరస్కరించుటలో వైఫల్యం."},"not_verified":"ద్రువీకరించలేదు","check_email":{"title":"ఈ సభ్యుని ఈమెయిల్ చూపు","text":"చూపు"}},"user":{"suspend_failed":"ఈ సభ్యుడిని సస్పెండ్ చేసేప్పుడు ఏదో తేడా జరిగింది.  {{error}}","unsuspend_failed":"ఈ వినియోగదారు వలన ఏదో తొలగింపబడని తప్పు జరిగింది {{దోషం}}","suspend_duration":"వినియోగదారు ఎంతకాలం నిలిపివేయబడ్డాడు?","suspend_duration_units":"(రోజులు)","suspend_reason_label":"మీరు ఎందుకు తొలగించబడ్డారు? ఈ పాఠ్యం \u003cb\u003e వినియోగదారును ప్రొఫైల్ పుట మీద ప్రతివారికి \u003c/b\u003e కనబడుతుంది, మరియు వినియోగదారుడు లాగిన్‌కు ప్రయత్నించినపుడు చూస్తారు.చిన్నదిగా ఉంచండి.","suspend_reason":"కారణం","suspended_by":"సస్పెండు చేసినవారు","delete_all_posts":"అన్ని టపాలూ తొలగించు","delete_all_posts_confirm":"మీరు తొలగించబడిన %{టపాలు} టపాలు మరియు %{విషయాలు} విషయాలు గురించి మాట్లాడుతున్నారు. ఖచ్చితమా ?","suspend":"సస్పెండు","unsuspend":"సస్పెండు తొలగించు","suspended":"సస్పెండయ్యాడా? ","moderator":"నిర్వాహకుడు?","admin":"అధికారి?","blocked":"నిలిపిన?","show_admin_profile":"అధికారి","edit_title":"శీర్షిక సవరించు","save_title":"శీర్షిక భద్రపరుచు","refresh_browsers":"బ్రౌజరు తాజాకరణ బలవంతంచేయి","refresh_browsers_message":"అన్ని క్లైంటులకు సందేశం పంపబడింది!","show_public_profile":"ప్రజా ప్రవర చూపు","impersonate":"పరకాయప్రవేశం చేయి","ip_lookup":"ఐపీ లుకప్","log_out":"లాగవుట్","logged_out":"వినియోగదారుడు అన్ని పరికరాలు లాగవుట్ చేశారు","revoke_admin":"నిర్వాహకులు తొలగించారు","grant_admin":"నిర్వాహకులు సమ్మతించారు","revoke_moderation":"సమన్వయం నిలిపివేశారు","grant_moderation":"సమన్వయం అనుమతించారు","unblock":"అడ్డగింపలేదు","block":"నిలుపు","reputation":"ప్రసిధ్ధ","permissions":"అనుమతులు","activity":"కలాపం","like_count":"ఇష్టాలు ఇచ్చినవి/స్వీకరించినవి","last_100_days":"గత నూరు రోజుల్లో","private_topics_count":"ప్రైవేటు విషయాలు","posts_read_count":"చదివిన టపాలు","post_count":"టపాలు సృష్టించిన","topics_entered":"సందర్శించిన విషయాలు ","flags_given_count":"ఇచ్చిన కేతనాలు ","flags_received_count":"వచ్చిన కేతనాలు","warnings_received_count":"అందిన హెచ్చరికలు","flags_given_received_count":"ఇచ్చిన కేతనాలు","approve":"అనుమతించు","approved_by":"అనుమతించినవారు","approve_success":"యాక్టివేషన్ సూచనలతో పాటు వినియోగదారు ఆమోదం మరియు ఈ-మెయిల్ పంపుతారు.","approve_bulk_success":"విజయవంతం! ఎంచుకున్న వినియోగదారులందరినీ ఆమోదించారు మరియు ప్రకటన చేశారు.","time_read":"చదువు సమయం","delete":"సభ్యుడిని తొలగించు","delete_forbidden_because_staff":"అధికారులు మరియు నిర్వాహకులను తొలగించలేరు","delete_posts_forbidden_because_staff":"నిర్వాహకుల మరియు పరిశీలకుల అన్ని టపాలు తొలగించలేము.","delete_confirm":"మీరు నిజంగా ఈ వినియోగదారుని తొలగిద్దాం అనుకుంటున్నారా ? ఇది శాశ్వతం!","delete_and_block":"ఈ ఈ-మెయిల్ మరియు IP అడ్రస్ ను తొలగించండి మరియు \u003cb\u003eనిరోధించండి\u003c/b\u003e","delete_dont_block":"తొలగింపు మాత్రమే","deleted":"ఈ సభ్యుడు తొలగించబడ్డాడు","delete_failed":"వినియోగదారుని తొలగించుటలో ఒక దోషం ఉంది.వినియోగదారుని తొలగించడానికి   ప్రయత్నించకముందే టపాలు అన్ని తొలగించండి.","send_activation_email":"చేతన ఈమెయిల్ పంపు","activation_email_sent":"ఒక చేతన ఈమెయిల్ పంపాము.","send_activation_email_failed":"చేతన ఈమెయిల్ పంపుటలో దోషం  %{error}","activate":"ఖాతా క్రియాశీలం చేయి","activate_failed":"సభ్యుడిని చేతనం చేయుటలో దోషం","deactivate_account":"ఖాతా అక్రియాశీలం చేయి","deactivate_failed":"వినియోగదారుని నిర్వీర్యం చేసే ఒక సమస్య ఉంది.","unblock_failed":"వినియోగదారుని అనుమతించడంలో ఒక సమస్య ఉంది.","block_failed":"వినియోగదారుని ఒక సమస్య నిరోధిస్తుంది.","deactivate_explanation":"క్రియారహిత వినియోగదారు తప్పనిసరిగా వారి ఈ-మెయిల్ ను సరిదిద్దాలి.","suspended_explanation":"నిలిపివేయబడ్డ వినియోగదారు లాగిన్ కాలేరు.","block_explanation":"అడ్డగింపబడ్డ వినియోగదారు టపాలు చేయలేరు లేదా విషయాలు మొదలుపెట్టలేరు.","trust_level_change_failed":"వినియోగదారు నమ్మకపు స్థాయి మార్చడానికి సమస్య ఉంది.","suspend_modal_title":"సభ్యుడిని సస్పెండు చేయి","trust_level_2_users":"నమ్మకం స్థాయి 2 సభ్యులు","trust_level_3_requirements":"నమ్మకపు స్థాయి 3 అవసరాలు","trust_level_locked_tip":"నమ్మకపు స్థాయి బంధింపబడిఉంది, వ్యవస్థ వినియోగదారుని ప్రోత్సాహించలేదు లేదా స్థాయి తగ్గించలేదు","trust_level_unlocked_tip":"నమ్మకపు స్థాయి బంధింపబడలేదు, వ్యవస్థ వినియోగదారుని ప్రోత్సాహించవచ్చు లేదా స్థాయి తగ్గించవచ్చు","lock_trust_level":"నమ్మకపు స్థాయి ని బంధించు","unlock_trust_level":"నమ్మకపు స్థాయిని వదిలేయి","tl3_requirements":{"title":"నమ్మకపు స్థాయి 3 అవసరాలు","table_title":"గత 100 రోజుల్లో:","value_heading":"విలువ","requirement_heading":"అవసరం","visits":"సందర్శనాలు","days":"రోజులు","topics_replied_to":"విషయాలు సమాధానంగా","topics_viewed":"చూసిన విషయాలు ","topics_viewed_all_time":"చూసిన విషయాలు (అన్ని వేళలా)","posts_read":"చదివిన టపాలు","posts_read_all_time":"చదివిన టపాలు (అన్ని వేళలా)","flagged_posts":"కేతనించిన టపాలు","flagged_by_users":"ఏ వినియోగదారులు కేతనించారు","likes_given":"ఇచ్చిన ఇష్టాలు","likes_received":"అందుకున్న ఇష్టాలు","likes_received_days":"స్వీకరించిన ఇష్టాలు:ప్రత్యేకమైన రోజులు","likes_received_users":"స్వీకరించిన ఇష్టాలు:ప్రత్యేకమైన వినియోగదారులు","qualifies":"నమ్మకపు స్థాయి 3 కు అర్హత .","does_not_qualify":"నమ్మకపు స్థాయి 3 కు అర్హత లేదు.","will_be_promoted":"త్వరలో స్థాయి పెరుగును.","will_be_demoted":"త్వరలో స్థాయి తగ్గును.","on_grace_period":"ప్రస్తుతం స్థాయి పెరుగుదల అదనపుకాలంలో ఉంది, స్థాయి తగ్గింపు జరగదు.","locked_will_not_be_promoted":"నమ్మకపు స్థాయి బంధించబడి ఉంది. స్థాయి పెరుగుదల ఉండదు.","locked_will_not_be_demoted":"నమ్మకపు స్థాయి బంధించబడి ఉంది.ఎప్పటికీ స్థానాన్ని తగ్గించలేరు."},"sso":{"title":"ఒక సైన్ ఆన్","external_id":"బాహ్య ఐడీ","external_username":"సభ్యనామం","external_name":"పేరు","external_email":"ఈమెయిల్","external_avatar_url":"ప్రవర బొమ్మ యూఆర్ యల్"}},"user_fields":{"title":"సభ్య క్షేత్రాలు","help":"వినియోగదారులు పూర్తి చేసిన వాటిని జోడించండి.","create":"సభ్య క్షేత్రం సృష్టించు","untitled":"పేరులేని","name":"క్షేత్రం పేరు","type":"క్షేత్రం టైపు","description":"క్షేత్రం వివరణ","save":"భద్రపరచు","edit":"సవరణ","delete":"తొలగించు","cancel":"రద్దుచేయి","delete_confirm":"మీరు నిజంగా ఈ సభ్య క్షేత్రం తొలగించాలనుకుంటున్నారా?","required":{"title":"సైన్అప్ అవసరమా?","enabled":"కావాలి","disabled":"అవసరంలేదు"},"editable":{"title":"సైన్అప్ తరువాత సవరించగలమా?","enabled":"సవరించదగిన","disabled":"సవరించలేని"},"show_on_profile":{"title":"ప్రజా ప్రవరపై చూపు?","enabled":"ప్రవరపై చూపు","disabled":"ప్రవరపై చూపబడలేదు"},"field_types":{"text":"పాఠ్య క్షేత్రం","confirm":"ఖాయము"}},"site_text":{"none":"సవరణను ప్రారంభించడానికి విషయం రకాన్ని ఎంచుకోండి.","title":"పాఠ్య కాంటెంటు"},"site_settings":{"show_overriden":"ప్రాబల్యం ఉన్న వాటిని మాత్రమే చూపించు","title":"అమరికలు","reset":"రీసెట్","none":"ఏదీకాదు","no_results":"ఏ ఫలితాలూ కనిపించలేదు.","clear_filter":"శుభ్రపరుచు","add_url":"URL కలుపు","categories":{"all_results":"అన్నీ","required":"కావాలి","basic":"ప్రాథమిక సెటప్","users":"వాడుకరులు","posting":"రాస్తున్నారు","email":"మెయిల్","files":"దస్త్రాలు","trust":"నమ్మకపు స్థాయిలు","security":"సెక్యూరిటీ","onebox":"ఒకపెట్టె","seo":"యస్ ఈ ఓ","spam":"స్పాము","rate_limits":"రోట్ హద్దులు","developer":"డవలపరు","embedding":"దేనిలోనైనా ఒదుగు","legal":"న్యాయ","uncategorized":"ఇతర","backups":"బ్యాకప్పులు","login":"లాగిన్","plugins":"చొప్పింతలు"}},"badges":{"title":"బ్యాడ్జీలు","new_badge":"కొత్త బ్యాడ్జీ","new":"కొత్త ","name":"పేరు","badge":"బ్యాడ్జీ","display_name":"ప్రదర్శించు పేరు","description":"వివరణ","badge_type":"బ్యాడ్జి టైపు","badge_grouping":"గుంపు","badge_groupings":{"modal_title":"బ్యాడ్జ్ గ్రూపులు"},"granted_by":"ఇచ్చిన వారు","granted_at":"ఇచ్చిన సమయం","reason_help":"(టపాకి లేదా విషయానికి లంకె )","save":"భద్రపరచు","delete":"తొలగించు","delete_confirm":"మీరు నిజంగా ఈ బ్యాడ్జి తొలగించాలనుకుంటున్నారా?","revoke":"రివోక్","reason":"కారణం","revoke_confirm":"మీరు నిజంగా ఈ బ్యాడ్జిని రివోక్ చేయాలనుకుంటున్నారా? ","edit_badges":"బ్యాడ్జీలు సవరించు","grant_badge":"బ్యాడ్జి ఇవ్వు","granted_badges":"ఇచ్చిన బ్యాడ్జీలు","grant":"ఇవ్వు","no_user_badges":"%{పేరు} ఏ చిహ్నాలు మంజూరు చేయలేదు.","no_badges":"మంజూరు చేసే చిహ్నాలు లేవు.","none_selected":"ఆరంభించడానికి ఒక బ్యాడ్జీని ఎంచుకోండి.","allow_title":"చిహ్నాన్ని శీర్షికగా వాడుకోవడానికి అనుమతి ఇవ్వండి.","multiple_grant":"అనేకసార్లు మంజూరు చేయవచ్చు","listable":"బహిరంగ చిహ్నాల పుటలో చూపండి","enabled":"బ్యాడ్జి చేతనం చేయి","icon":"ఐకాన్","image":"బొమ్మ","icon_help":"చిత్రానికి బ్రహ్మాండమైన ఫాంట్  లేదా URL గాని ఉపయోగించండి","target_posts":"టపాలు లక్ష్యంగా ప్రశ్న","show_posts":"చిహ్నాల పుటలో మంజూరు అయిన చిహ్నాన్ని చూపండి","trigger":"ట్రిగ్గరు","trigger_type":{"none":"రోజు ఉన్నతీకరించు","post_action":"వినియోగదారుడు టపాపై పనిచేసినపుడు","post_revision":"వినియోగదారుడు టపా సృష్టిస్తున్నప్పుడు లేదా సవరిస్తున్నప్పుడు","trust_level_change":"వినియోగదారుడు నమ్మకపుస్థాయి మార్చినప్పుడు","user_change":"వినియోగదారుడు సవరిస్తున్నపుడు లేదా సృష్టిస్తున్నపుడు"},"preview":{"sql_error_header":"ప్రశ్నతో దోషం ఉంది.","bad_count_warning":{"header":"హెచ్చరిక!"},"sample":"నమూనా:","grant":{"with":"\u003cspan class=\"username\"\u003e%{వినియోగదారు పేరు}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{వినియోగదారు పేరు}\u003c/span\u003e టపా కొరకు%{లంకె}","with_post_time":"\u003cspan class=\"సభ్యుల పేరు\"\u003e%{username}\u003c/span\u003e for post in %{link} at \u003cspan class=\"సమయం\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"ఇమోజి","add":"కొత్త ఇమోజి కలుపు","name":"పేరు","image":"బొమ్మ","delete_confirm":"మీరు నిజంగా %{పేరు}: ఎమోజీ ని తొలగించాలనుకుంటున్నారా ?"}},"lightbox":{"download":"దిగుమతించు"},"search_help":{"title":"సహాయం వెతుకు"},"keyboard_shortcuts_help":{"title":"కీబోర్డు షార్ట్ కట్లు","jump_to":{"title":"వెళ్లు","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e తాజా","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e కొత్త","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e చదవనవి","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e వర్గాలు","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e పైన"},"navigation":{"title":"నావిగేషను","jump":"\u003cb\u003e#\u003c/b\u003e టపాకు వెళ్లు #","back":"\u003cb\u003eu\u003c/b\u003e వెనుకకు","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eప్రవేశం\u003c/b\u003e ఎంచుకున్న విషయం తెరువు","next_prev":"\u003cb\u003eమార్పు\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eమార్పు\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e తర్వాతి/ముందరి విభాగం"},"application":{"title":"అనువర్తనం","create":"\u003cb\u003ec\u003c/b\u003e కొత్త టపా సృష్టించు","notifications":"\u003cb\u003en\u003c/b\u003e తెరచిన ప్రకటనలు","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e యూజర్ మెనూ తెరువు","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e నవీకరించిన విషయాలను చూపించండి","search":"\u003cb\u003e/\u003c/b\u003e వెతుకు","help":"\u003cb\u003e?\u003c/b\u003e కీ బోర్డ్ సహాయాన్ని తెరువు","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e తీసివేసిన కొత్త/టపాలు","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e తీసివేసిన విషయాలు"},"actions":{"title":"చర్యలు","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e విషయం చేర్చు/విడదీయు","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e విషయం పంచు","share_post":"\u003cb\u003es\u003c/b\u003e టపా పంచు","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e లంకె విషయంగా సమాధానం","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e టపా కి సమాధానం","reply_post":"\u003cb\u003er\u003c/b\u003e టపా కి సమాధానం","like":"\u003cb\u003el\u003c/b\u003e టపా ని ఇష్టపడు","flag":"\u003cb\u003e!\u003c/b\u003e టపా కేతనం","bookmark":"\u003cb\u003eb\u003c/b\u003eటపా పేజీక","edit":"\u003cb\u003ee\u003c/b\u003e టపా సవరణ","delete":"\u003cb\u003ed\u003c/b\u003e టపా తొలగించు","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e విషయాన్ని ఆపివేయండి","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e నిత్య (అప్రమేయ) విషయం","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e విషయం వెతుకు","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e చూసిన విషయం"}},"badges":{"title":"బ్యాడ్జీలు","allow_title":"శీర్షికగా కూడా వాడవచ్చు","multiple_grant":"పలుమార్లు బహూకరించవచ్చు","more_badges":{"one":"+%{count} కంటే","other":"+%{count} ఇంకా"},"granted":{"one":"1 మంజూరు","other":"%{లెక్క} మంజూరు"},"select_badge_for_title":"మీ శీర్షికగా ఉపయోగించడానికి ఒక చిహ్నాన్ని ఎంపిక చేయండి.","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"మొదలుపెట్టడం"},"community":{"name":"కమ్యునిటీ"},"trust_level":{"name":"నమ్మకపు స్థాయి"},"other":{"name":"ఇతర"},"posting":{"name":"రాస్తున్నారు"}},"badge":{"editor":{"name":"ఎడిటరు","description":"తొలి టపా సవరణ"},"basic_user":{"name":"ప్రాథమిక","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eమంజూరు చేసిన\u003c/a\u003e అన్ని ఆవశ్యక సామాజిక చర్యలు"},"member":{"name":"సభ్యుడు","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eమంజూరు చేసిన \u003c/a\u003e ఆహ్వానాలు"},"regular":{"name":"రెగ్యులరు"},"leader":{"name":"లీడరు"},"welcome":{"name":"సుస్వాగతం","description":"ఒక ఇష్టాన్ని అందుకున్నారు"},"autobiographer":{"name":"ఆత్మకధావాది","description":"వినియోగదారు నింపిన \u003ca href=\"/my/preferences\"\u003eఫ్రొపైల్ \u003c/a\u003e సమాచారం"},"anniversary":{"name":"వార్షికోత్సవం","description":"ఒక సంవత్సరం నుండి చురుకైన సభ్యుడు, కనీసం ఒకసారి టపా చేశాడు"},"nice_post":{"name":"మంచి టపా","description":"ఒక టపా 10 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"good_post":{"name":"చాలా మంచి టపా","description":"ఒక టపా 25 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"great_post":{"name":"బహుమంచి టపా","description":"ఒక టపా 50 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"nice_topic":{"name":"మంచి విషయం","description":"ఒక విషయం 10 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"good_topic":{"name":"చాలా మంచి విషయం","description":"ఒక విషయం 25 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"great_topic":{"name":"బహుమంచి విషయం","description":"ఒక విషయం 50 ఇష్టాలు స్వీకరిస్తే , ఈ చిహ్నం అనేక సార్లు మంజూరు అవుతుంది"},"nice_share":{"name":"మంచి పంపకం","description":"ఒక టపాను 25మంది సభ్యులతో పంచుకున్నారు"},"good_share":{"name":"చాలామంచి పంపకం","description":"ఒక టపాను 300మంది సభ్యులతో పంచుకున్నారు"},"great_share":{"name":"బహుమంచి పంపకం","description":"ఒక టపాను 1000 మంది సభ్యులతో పంచుకున్నారు"},"first_like":{"name":"తొలి ఇష్టం","description":"టపాను ఇష్టపడ్డారు"},"first_flag":{"name":"తొలి కేతనం","description":"ఒక టపాను కేతనించారు"},"first_share":{"name":"తొలి పంపకం","description":"ఒక టపాను పంచారు"},"first_link":{"name":"తొలి లంకె","description":"వేరొక విషయానికి అంతర్గతంగా లంకె కలిపారు"},"first_quote":{"name":"తొలి కోట్","description":"ఒక సభ్యుడిని కోట్ చేసారు"},"read_guidelines":{"name":"మార్గదర్శకాలు చదువు","description":"\u003ca href=\"/guidelines\"\u003eకమ్యునిటీ మార్గదర్శకాలు\u003c/a\u003e చదవండి"},"reader":{"name":"చదువరి","description":"100 టపాల కన్నా ఎక్కువ ఉన్న అంశంలో ప్రతి టపా చదవండి"}}}}},"en":{"js":{"number":{"format":{"separator":".","delimiter":","},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"full_no_year_no_time":"MMMM Do","full_with_year_no_time":"MMMM Do, YYYY","later":{"x_days":{"one":"1 day later","other":"%{count} days later"},"x_months":{"one":"1 month later","other":"%{count} months later"},"x_years":{"one":"1 year later","other":"%{count} years later"}}},"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","alternation":"or","bookmarks":{"confirm_clear":"Are you sure you want to clear all the bookmarks from this topic?"},"uploading_filename":"Uploading {{filename}}...","switch_to_anon":"Anonymous Mode","switch_from_anon":"Exit Anonymous","banner":{"edit":"Edit this banner \u003e\u003e"},"queue":{"topic":"Topic:","approve":"Approve","reject":"Reject","delete_user":"Delete User","title":"Needs Approval","none":"There are no posts to review.","edit":"Edit","view_pending":"view pending posts","has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval","other":"This topic has \u003cb\u003e{{count}}\u003c/b\u003e posts awaiting approval"},"confirm":"Save Changes","delete_prompt":"Are you sure you want to delete \u003cb\u003e%{username}\u003c/b\u003e? This will remove all of their posts and block their email and ip address.","approval":{"title":"Post Needs Approval","description":"We've received your new post but it needs to be approved by a moderator before it will appear. Please be patient.","pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending.","other":"You have \u003cstrong\u003e{{count}}\u003c/strong\u003e posts pending."}}},"directory":{"filter_name":"filter by username","likes_given":"Given","likes_received":"Received","topics_entered":"Entered","topics_entered_long":"Topics Entered","time_read":"Time Read","topic_count":"Topics","topic_count_long":"Topics Created","post_count":"Replies","post_count_long":"Replies Posted","no_results":"No results were found.","days_visited":"Visits","days_visited_long":"Days Visited","posts_read":"Read","posts_read_long":"Posts Read","total_rows":{"one":"1 user","other":"%{count} users"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"user_action_groups":{"5":"Replies","6":"Responses","14":"Pending"},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"}},"user_fields":{"none":"(select an option)"},"user":{"new_private_message":"New Message","private_message":"Message","expand_profile":"Expand","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_default":"Turn On Notifications","perm_denied_btn":"Permission Denied","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","disable":"Disable Notifications","currently_enabled":"(currently enabled)","enable":"Enable Notifications","currently_disabled":"(currently disabled)","each_browser_note":"Note: You have to change this setting on every browser you use."},"dynamic_favicon":"Show new / updated topic count on browser icon","blocked_tooltip":"This user is blocked","watched_categories_instructions":"You will automatically watch all new topics in these categories. You will be notified of all new posts and topics, and a count of new posts will also appear next to the topic.","tracked_categories_instructions":"You will automatically track all new topics in these categories. A count of new posts will appear next to the topic.","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_users":"Muted","muted_users_instructions":"Suppress all notifications from these users.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_about":{"error":"There was an error changing ths value."},"change_avatar":{"gravatar_title":"Change your avatar on Gravatar's website","image_is_not_a_square":"Warning: we've cropped your image; width and height were not equal.","cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"name":{"instructions_required":"Your full name"},"email_direct":"Send me an email when someone quotes me, replies to my post, mentions my @username, or invites me to a topic","email_private_messages":"Send me an email when someone messages me","email_always":"Send me email notifications even when I am active on the site","new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"immediately":"immediately","after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab":"Redeemed","redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab":"Pending","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"success":"File uploaded successfully, you will be notified via message when the process is complete."}},"avatar":{"header_title":"profile, messages, bookmarks and preferences"},"stream":{"private_message":"message"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"read_only_mode":{"enabled":"Read-only mode is enabled. You can continue to browse the site but interactions may not work."},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","last_reply_lowercase":"last reply","replies_lowercase":{"one":"reply","other":"replies"},"signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"private_message_info":{"title":"Message","remove_allowed_user":"Do you really want to remove {{name}} from this message?"},"forgot_password":{"title":"Password Reset"},"login":{"rate_limit":"Please wait before trying to log in again.","to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","saving_draft_tip":"saving...","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","error":{"try_like":"Have you tried the \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e button?"},"create_topic":"Create Topic","create_pm":"Message","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"title":"notifications of @name mentions, replies to your posts and topics, messages, etc","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"},"popup":{"mentioned":"{{username}} mentioned you in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} quoted you in \"{{topic}}\" - {{site_title}}","replied":"{{username}} replied to you in \"{{topic}}\" - {{site_title}}","posted":"{{username}} posted in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sent you a private message in \"{{topic}}\" - {{site_title}}","linked":"{{username}} linked to your post from \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip":"select images from your device","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor","select_file":"Select File"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"no_more_results":"No more results found.","search_help":"Search help","context":{"private_messages":"Search messages"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"},"none":{"search":"There are no search results."},"bottom":{"search":"There are no more search results."}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"private_message":"Start a message","auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","progress":{"jump_bottom":"jump to last post"},"notifications":{"reasons":{"1_2":"You will be notified if someone mentions your @name or replies to you.","1":"You will be notified if someone mentions your @name or replies to you."},"watching_pm":{"description":"You will be notified of every new reply in this message, and a count of new replies will be shown."},"watching":{"description":"You will be notified of every new reply in this topic, and a count of new replies will be shown."},"tracking_pm":{"description":"A count of new replies will be shown for this message. You will be notified if someone mentions your @name or replies to you."},"tracking":{"description":"A count of new replies will be shown for this topic. You will be notified if someone mentions your @name or replies to you. "},"regular":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"regular_pm":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"muted_pm":{"description":"You will never be notified of anything about this message."},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"actions":{"multi_select":"Select Posts…","auto_close":"Auto Close…","pin":"Pin Topic…","unpin":"Un-Pin Topic…"},"feature":{"pin":"Pin Topic","unpin":"Un-Pin Topic","pin_globally":"Pin Topic Globally","make_banner":"Banner Topic","remove_banner":"Remove Banner Topic"},"feature_topic":{"title":"Feature this topic","pin":"Make this topic appear at the top of the {{categoryLink}} category until","confirm_pin":"You already have {{count}} pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic in this category?","unpin":"Remove this topic from the top of the {{categoryLink}} category.","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Users can unpin the topic individually for themselves.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","confirm_pin_globally":"You already have {{count}} globally pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic globally?","unpin_globally":"Remove this topic from the top of all topic lists.","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Users can unpin the topic individually for themselves.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Make this topic into a banner that appears at the top of all pages.","remove_banner":"Remove the banner that appears at the top of all pages.","banner_note":"Users can dismiss the banner by closing it. Only one topic can be bannered at any given time.","no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"invite_private":{"title":"Invite to Message","success":"We've invited that user to participate in this message."},"controls":"Topic Controls","invite_reply":{"action":"Send Invite","help":"invite others to this topic via email or notifications","sso_enabled":"Enter the username of the person you'd like to invite to this topic.","to_topic_blank":"Enter the username or email address of the person you'd like to invite to this topic.","to_topic_email":"You've entered an email address. We'll email an invitation that allows your friend to immediately reply to this topic.","to_topic_username":"You've entered a username. We'll send a notification with a link inviting them to this topic.","to_username":"Enter the username of the person you'd like to invite. We'll send a notification with a link inviting them to this topic.","success_email":"We mailed out an invitation to \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. We'll notify you when the invitation is redeemed. Check the invitations tab on your user page to keep track of your invites.","success_username":"We've invited that user to participate in this topic.","error":"Sorry, we couldn't invite that person. Perhaps they have already been invited? (Invites are rate limited)"},"change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","edit":"Editing {{link}} {{replyAvatar}} {{username}}","gap":{"one":"view 1 hidden reply","other":"view {{count}} hidden replies"},"has_replies":{"one":"{{count}} Reply","other":"{{count}} Replies"},"has_likes":{"one":"{{count}} Like","other":"{{count}} Likes"},"has_likes_title":{"one":"1 person liked this post","other":"{{count}} people liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"change_owner":"Change Ownership"},"actions":{"people":{"notify_user":"{{icons}} sent a message","notify_user_with_url":"{{icons}} sent a \u003ca href='{{postUrl}}'\u003emessage\u003c/a\u003e"},"by_you":{"notify_user":"You sent a message to this user"},"by_you_and_others":{"notify_user":{"one":"You and 1 other sent a message to this user","other":"You and {{count}} other people sent a message to this user"}},"by_others":{"notify_user":{"one":"1 person sent a message to this user","other":"{{count}} sent a message to this user"}}},"revisions":{"controls":{"comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"}}},"category":{"all":"All categories","topic_template":"Topic Template","create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_action":"Message","notify_staff":"Notify Staff"},"flagging_topic":{"notify_action":"Message"},"topic_map":{"participants_title":"Frequent Posters","links_title":"Popular Links"},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"views_lowercase":{"one":"view","other":"views"},"likes_lowercase":{"one":"like","other":"likes"},"users_lowercase":{"one":"user","other":"users"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"search":{"title":"Search","help":"search all topics"},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"all":{"title":"All Time"},"yearly":{"title":"Yearly"},"quarterly":{"title":"Quarterly"},"monthly":{"title":"Monthly"},"weekly":{"title":"Weekly"},"daily":{"title":"Daily"},"all_time":"All Time","this_year":"Year","this_quarter":"Quarter","this_month":"Month","this_week":"Week","other_periods":"see top"}},"poll":{"voters":{"one":"voter","other":"voters"},"total_votes":{"one":"total vote","other":"total votes"},"average_rating":"Average rating: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"between_min_and_max_options":"You may choose between \u003cstrong\u003e%{min}\u003c/strong\u003e and \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"cast-votes":{"title":"Cast your votes","label":"Vote now!"},"show-results":{"title":"Display the poll results","label":"Show results"},"hide-results":{"title":"Back to your votes","label":"Hide results"},"open":{"title":"Open the poll","label":"Open","confirm":"Are you sure you want to open this poll?"},"close":{"title":"Close the poll","label":"Close","confirm":"Are you sure you want to close this poll?"},"error_while_toggling_status":"There was an error while toggling the status of this poll.","error_while_casting_votes":"There was an error while casting your votes."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"dashboard":{"private_messages_short":"Msgs","private_messages_title":"Messages","mobile_title":"Mobile"},"flags":{"agree_flag_hide_post_title":"Hide this post and automatically send the user a message urging them to edit it"},"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","custom":"Custom","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","automatic":"Automatic","default_title":"Default title for all users in this group","primary_group":"Automatically set as primary group","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"plugins":{"enabled":"Enabled?","is_enabled":"Y","not_enabled":"N","change_settings_short":"Settings"},"backups":{"read_only":{"enable":{"label":"Enable read-only mode"},"disable":{"label":"Disable read-only mode"}},"upload":{"label":"Upload","title":"Upload a backup to this instance"},"operations":{"cancel":{"label":"Cancel"},"backup":{"label":"Backup"},"download":{"label":"Download"},"restore":{"label":"Restore"},"rollback":{"label":"Rollback"}}},"export_csv":{"success":"Export initiated, you will be notified via message when the process is complete."},"export_json":{"button_text":"Export"},"customize":{"embedded_css":"Embedded CSS","import":"Import","import_title":"Select a file or paste text","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"anonymize_user":"anonymize user","roll_up":"roll up IP blocks","change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}},"screened_emails":{"description":"When someone tries to create a new account, the following email addresses will be checked and the registration will be blocked, or some other action performed."},"screened_ips":{"roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?"}},"impersonate":{"not_found":"That user can't be found.","invalid":"Sorry, you may not impersonate that user."},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"},"reject_failures":{"other":"Failed to reject %{count} users."}},"user":{"anonymize":"Anonymize User","anonymize_confirm":"Are you SURE you want to anonymize this account? This will change the username and email, and reset all profile information.","anonymize_yes":"Yes, anonymize this account","anonymize_failed":"There was a problem anonymizing the account.","delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)","other":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} days old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)","other":"Can't delete all posts. Some posts are older than %{count} days old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)","other":"Can't delete all posts because the user has more than %{count} posts.  (delete_all_posts_max)"}},"user_fields":{"options":"Options","field_types":{"dropdown":"Dropdown"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"add_host":"add host","categories":{"user_preferences":"User Preferences"}},"badges":{"expand":"Expand \u0026hellip;","query":"Badge Query (SQL)","auto_revoke":"Run revocation query daily","preview":{"link_text":"Preview granted badges","plan_text":"Preview with query plan","modal_title":"Badge Query Preview","error_help":"See the following links for help with badge queries.","bad_count_warning":{"text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."},"grant":{"with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"help":"Add new emoji that will be available to everyone. (PROTIP: drag \u0026 drop multiple files at once)"},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","add":"Add","filter":"Search (URL or External URL)"}}},"keyboard_shortcuts_help":{"jump_to":{"home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Home","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Bookmarks","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"navigation":{"up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Move selection \u0026uarr; \u0026darr;"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"},"actions":{"bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Toggle bookmark topic","quote_post":"\u003cb\u003eq\u003c/b\u003e Quote post"}},"badges":{"badge_count":{"one":"1 Badge","other":"%{count} Badges"},"badge":{"regular":{"description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"leader":{"description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eGranted\u003c/a\u003e global edit, pin, close, archive, split and merge"},"promoter":{"name":"Promoter","description":"Invited a user"},"campaigner":{"name":"Campaigner","description":"Invited 3 basic users (trust level 1)"},"champion":{"name":"Champion","description":"Invited 5 members (trust level 2)"},"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'te';
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
