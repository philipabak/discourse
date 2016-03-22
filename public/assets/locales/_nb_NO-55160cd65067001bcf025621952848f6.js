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
    })({"topic.read_more_MF" : function(){ return "Invalid Format: Plural Function not found for locale: nb_NO";} , "posts_likes_MF" : function(){ return "Invalid Format: Plural Function not found for locale: nb_NO";}});I18n.translations = {"nb_NO":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Byte"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"D MMM h:mm a","long_no_year_no_time":"D MMM","full_no_year_no_time":"MMMM Do","long_with_year":"D MMM, YYYY h:mm a","long_with_year_no_time":"D MMM, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"D MMM, 'YY LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM, 'YY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1t","other":"%{count}t"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1år","other":"%{count}år"},"over_x_years":{"one":"\u003e 1år","other":"\u003e %{count}år"},"almost_x_years":{"one":"1år","other":"%{count}år"},"date_month":"D MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minutt","other":"%{count} minutter"},"x_hours":{"one":"1 time","other":"%{count} timer"},"x_days":{"one":"1 dag","other":"%{count} dager"},"date_year":"D MMM, 'YY"},"medium_with_ago":{"x_minutes":{"one":"1 minutt siden","other":"%{count} minutter siden"},"x_hours":{"one":"1 time siden","other":"%{count} timer siden"},"x_days":{"one":"1 dag siden","other":"%{count} dager siden"}},"later":{"x_days":{"one":"1 dag senere","other":"%{count} dager senere"},"x_months":{"one":"1 måned senere","other":"%{count} måneder senere"},"x_years":{"one":"1 år senere","other":"%{count} år senere"}}},"share":{"topic":"del en lenke til dette emnet","post":"innlegg #%{postNumber}","close":"lukk","twitter":"del denne lenken på Twitter","facebook":"del denne lenken på Facebook","google+":"del denne lenken på Google+","email":"del denne lenken i en e-post"},"action_codes":{"autoclosed":{"enabled":"lukket %{when}","disabled":"åpnet %{when}"},"closed":{"enabled":"lukket %{when}","disabled":"åpnet %{when}"},"archived":{"enabled":"arkivert %{when}","disabled":"fjernet fra arkiv %{when}"},"pinned":{"enabled":"festet %{when}","disabled":"avfestet %{when}"},"pinned_globally":{"enabled":"festet globalt %{when}"}},"topic_admin_menu":"admin-handlinger for emne","emails_are_disabled":"All utgående e-post har blitt deaktivert globalt av en administrator. Ingen e-postvarslinger vil bli sendt.","edit":"rediger tittelen og kategorien til dette emnet","not_implemented":"Beklager, denne funksjonen har ikke blitt implementert enda.","no_value":"Nei","yes_value":"Ja","generic_error":"Beklager, det har oppstått en feil.","generic_error_with_reason":"Det oppstod et problem: %{error}","sign_up":"Registrer deg","log_in":"Logg inn","age":"Alder","joined":"Ble medlem","admin_title":"Admin","flags_title":"Rapporteringer","show_more":"vis mer","show_help":"alternativer","links":"Lenker","links_lowercase":{"one":"link","other":"linker"},"faq":"FAQ","guidelines":"Retningslinjer","privacy_policy":"Personvern","privacy":"Personvern","terms_of_service":"Betingelser","mobile_view":"Mobilvisning","desktop_view":"Skrivebordsvisning","you":"Du","or":"eller","now":"akkurat nå","read_more":"les mer","more":"Mer","less":"Mindre","never":"aldri","daily":"daglig","weekly":"ukentlig","every_two_weeks":"annenhver uke","every_three_days":"hver tredje dag","max_of_count":"maksimum av {{count}}","alternation":"eller","character_count":{"one":"{{count}} tegn","other":"{{count}} tegn"},"suggested_topics":{"title":"Anbefalte emner"},"about":{"simple_title":"Om","title":"Om %{title}","stats":"Nettstedsstatistikk","our_admins":"Våre administratorer","our_moderators":"Våre moderatorer","stat":{"all_time":"Gjennom tidene","last_7_days":"Siste 7 dager","last_30_days":"Siste 30 dager"},"like_count":"Likes","topic_count":"Emner","post_count":"Innlegg","user_count":"Nye brukere","active_user_count":"Aktive brukere","contact":"Kontakt Oss","contact_info":"Hvis noe kritisk skulle oppstå eller det er en hastesak som påvirker siden, ta kontakt på %{contact_info}."},"bookmarked":{"title":"Bokmerke","clear_bookmarks":"Fjern bokmerker","help":{"bookmark":"Klikk for å bokmerke det første innlegget i dette emnet","unbookmark":"Klikk for å fjerne alle bokmerker i dette emnet"}},"bookmarks":{"not_logged_in":"beklager, du må være innlogget for å kunne bokmerke innlegg","created":"du har bokmerket dette innlegget","not_bookmarked":"du har lest dette innlegget, trykk for å bokmerke det","last_read":"dette er det siste innlegget du har lest, trykk for å bokmerke det","remove":"Fjern bokmerke","confirm_clear":"Er du sikker på at du vil fjerne alle bokmerkene fra dette emnet?"},"topic_count_latest":{"one":"{{count}} nytt eller oppdatert emne","other":"{{count}} nye eller oppdaterte emner"},"topic_count_unread":{"one":"{{count}} ulest emne","other":"{{count}} uleste emner"},"topic_count_new":{"one":"{{count}} nytt emne","other":"{{count}} nye emner"},"click_to_show":"Klikk for å vise","preview":"forhåndsvisning","cancel":"avbryt","save":"Lagre endringer","saving":"Lagrer...","saved":"Lagret!","upload":"Last opp","uploading":"Laster opp...","uploading_filename":"Laster opp {{filename}}...","uploaded":"Lastet opp!","enable":"Aktiver","disable":"Deaktiver","undo":"Angre","revert":"Reverser","failed":"Mislykket","switch_to_anon":"Anonym modus","banner":{"close":"Fjern denne banneren","edit":"Endre denne banneren \u003e\u003e"},"choose_topic":{"none_found":"Ingen emner funnet.","title":{"search":"Søk etter et emne ved navn, url eller id:","placeholder":"skriv emnetittelen her"}},"queue":{"topic":"Emne:","approve":"Godkjenn","reject":"Avvis","delete_user":"Slett Bruker","title":"Trenger godkjenning","none":"Det er ingen innlegg som må evalueres.","edit":"Rediger","cancel":"Avbryt","view_pending":"vis påventende innlegg","has_pending_posts":{"one":"Dette emnet har \u003cb\u003e1\u003c/b\u003e innlegg som venter på godkjenning","other":"Dette emnet har \u003cb\u003e{{count}}\u003c/b\u003e innlegg som venter på godkjenning"},"confirm":"Lagre endringer","delete_prompt":"Er du sikker du ønsker å slette \u003cb\u003e%{username}\u003c/b\u003e? Dette vil fjerne alle brukerens innnlegg og blokkere epost og ip-addressen.","approval":{"title":"Innlegg Behøver Godkjenning","description":"Vi har mottatt ditt nye innlegg men det krever godkjenning av en moderator før det vises. Venligst vær tålmodig.","pending_posts":{"one":"Du har \u003cstrong\u003e1\u003c/strong\u003e innlegg som venter på godkjenning.","other":"Du har \u003cstrong\u003e{{count}}\u003c/strong\u003e innlegg som venter på godkjenning."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e postet \u003ca href='{{topicUrl}}'\u003eemnet\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eDu\u003c/a\u003e postet \u003ca href='{{topicUrl}}'\u003eemnet\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e besvarte \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eDu\u003c/a\u003e besvarte \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e besvarte \u003ca href='{{topicUrl}}'\u003eemnet\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eDu\u003c/a\u003e besvarte \u003ca href='{{topicUrl}}'\u003eemnet\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e nevnte \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e nevnte \u003ca href='{{user2Url}}'\u003edeg\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eDu\u003c/a\u003e nevnte \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Postet av \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Postet av \u003ca href='{{userUrl}}'\u003edeg\u003c/a\u003e","sent_by_user":"Sendt av \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Sendt av \u003ca href='{{userUrl}}'\u003edeg\u003c/a\u003e"},"directory":{"filter_name":"filtrer etter navn","title":"Brukere","likes_given":"Gitt","likes_received":"Mottatt","topics_entered":"Lest","topics_entered_long":"Emner lest","time_read":"Tid lest","topic_count":"Emner","topic_count_long":"Emner startet","post_count":"Svar","post_count_long":"Svar","no_results":"Ingen treff","days_visited":"Besøk","days_visited_long":"Dager besøkt","posts_read":"Lest","posts_read_long":"Lest","total_rows":{"one":"1 bruker","other":"%{count} brukere"}},"groups":{"add":"Legg til","selector_placeholder":"Legg til medlemmer","owner":"eier","visible":"Gruppen er synlig for alle brukere","title":{"one":"gruppe","other":"grupper"},"members":"Medlemmer","posts":"Innlegg","alias_levels":{"title":"Hvem kan benytte denne gruppen som alias?","nobody":"Ingen","only_admins":"Kun administratorer","mods_and_admins":"Kun moderatorer og administratorer","members_mods_and_admins":"Kun gruppemedlemmer, moderatorer og administratorer","everyone":"Alle"},"trust_levels":{"none":"ingen"}},"user_action_groups":{"1":"Liker tildelt","2":"Liker mottatt","3":"Bokmerker","4":"Emner","5":"Svar","6":"Svar","7":"Omtalelser","9":"Sitater","10":"Favoritter","11":"Redigeringer","12":"Sendte elementer","13":"Innboks","14":"Venter"},"categories":{"all":"Alle","all_subcategories":"alle","no_subcategory":"ingen","category":"Kategori","posts":"Innlegg","topics":"Emner","latest":"Siste","latest_by":"siste av","toggle_ordering":"veksle rekkefølge","subcategories":"Underkategorier","topic_stats":"Antall nye emner.","topic_stat_sentence":{"one":"%{count} nytt emner de siste %{unit}.","other":"%{count} nye emner de siste %{unit}."},"post_stats":"Antall nye innlegg.","post_stat_sentence":{"one":"%{count} nye innlegg den siste %{unit}.","other":"%{count} nye innlegg de siste %{unit}."}},"ip_lookup":{"title":"Slå opp IP-adresse","hostname":"Vertsnavn","location":"Posisjon","location_not_found":"(ukjent)","organisation":"Organisasjon","phone":"Telefon","other_accounts":"Andre kontoer med denne IP-adressen:","delete_other_accounts":"Slett %{count}","username":"brukernavn","trust_level":"TN","read_time":"lesetid","topics_entered":"emner laget","post_count":"# innlegg","confirm_delete_other_accounts":"Er du sikker på at du vil slette disse kontoene?"},"user_fields":{"none":"(velg et alternativ)"},"user":{"said":"{{username}}:","profile":"Profil","mute":"Demp","edit":"Rediger innstillinger","download_archive":"Last ned mine innlegg","new_private_message":"Ny Melding","private_message":"Melding","private_messages":"Meldinger","activity_stream":"Aktivitet","preferences":"Innstillinger","bookmarks":"Bokmerker","bio":"Om meg","invited_by":"Invitert av","trust_level":"Tillitsnivå","notifications":"Varsler","desktop_notifications":{"perm_default":"Slå på varslinger","perm_denied_btn":"Tillatelse avslått","disable":"Slå av varslinger","currently_enabled":"(slått på)","enable":"Slå på varslinger","currently_disabled":"(slått av)","each_browser_note":"Merk: Du må endre denne innstillinger for hver nettleser du bruker."},"dismiss_notifications":"Merk alle som lest","dismiss_notifications_tooltip":"Merk alle uleste varslinger som lest","disable_jump_reply":"Ikke hopp til ditt nye innlegg etter svar","dynamic_favicon":"Vis antall nye / oppdaterte emner på nettleser ikonet","edit_history_public":"La andre brukere se mine innleggsrevisjoner","external_links_in_new_tab":"Åpne alle eksterne lenker i ny fane","enable_quoting":"Aktiver svar med sitat for uthevet tekst","change":"Endre","moderator":"{{user}} er en moderator","admin":"{{user}} er en admin","moderator_tooltip":"Denne brukeren er en moderator","admin_tooltip":"Denne brukeren er en administrator","blocked_tooltip":"Denne brukeren er blokkert","suspended_notice":"Denne brukeren er bannlyst til {{date}}.","suspended_reason":"Begrunnelse:","github_profile":"Github","mailing_list_mode":"Send meg en e-post for hvert nye innlegg (hvis ikke emnet eller kategorien er dempet)","watched_categories":"Følger","watched_categories_instructions":"Du vil automatisk følge alle nye emner i disse kategoriene. Du vil bli varslet om alle nye innlegg og emner. Antallet uleste og nye emner vil også vises.","tracked_categories":"Sporet","tracked_categories_instructions":"Du vil automatisk spore alle nye emner i disse kategoriene. Antallet uleste og nye innlegg vil vises ved emnets oppføring.","muted_categories":"Dempet","delete_account":"Slett kontoen min","delete_account_confirm":"Er du sikker på at du vil slette kontoen din permanent? Denne handlingen kan ikke angres!","deleted_yourself":"Slettingen av din konto har vært vellykket.","delete_yourself_not_allowed":"Kontoen din kan ikke slettes akkurat nå. Kontakt en administrator til å slette kontoen for deg.","unread_message_count":"Meldinger","admin_delete":"Slett","users":"Brukere","muted_users":"Dempet","muted_users_instructions":"Skjul alle varsler fra denne brukeren","staff_counters":{"flags_given":"nyttige rapporteringer","flagged_posts":"rapporterte innlegg","deleted_posts":"slettede innlegg","suspensions":"suspenderinger","warnings_received":"advarsler"},"messages":{"all":"Alle","mine":"Mine","unread":"Uleste"},"change_password":{"success":"(e-post sendt)","in_progress":"(sender e-post)","error":"(feil)","action":"Send e-post for passordnullstilling","set_password":"Sett passord"},"change_about":{"title":"Rediger om meg","error":"Det skjedde en feil ved endring av denne verdien"},"change_username":{"title":"Endre brukernavn","confirm":"Hvis du endrer brukernavn vil alle siteringer av dine innlegg og nevning ved ditt @navn gå i stykker. Er du sikker på at du vil gjøre det?","taken":"Beklager, det brukernavnet er tatt.","error":"Det skjedde en feil ved endring av ditt brukernavn.","invalid":"Det brukernavnet er ugyldig. Det kan bare inneholde nummer og bokstaver."},"change_email":{"title":"Endre e-postadresse","taken":"Beklager, den e-postadressen er ikke tilgjengelig.","error":"Det oppsto en feil ved endring av din e-postadresse. Kanskje den adressen allerede er i bruk?","success":"Vi har sendt en e-post til den adressen. Vennligst følg meldingens instruksjoner for bekreftelse."},"change_avatar":{"title":"Bytt profilbilde","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, basert på","gravatar_title":"Endre din avatar på Gravatars nettside","refresh_gravatar_title":"Oppdater din Gravatar","letter_based":"Systemtildelt profilbilde","uploaded_avatar":"Egendefinert bilde","uploaded_avatar_empty":"Legg til egendefinert bilde","upload_title":"Last opp bilde","upload_picture":"Last opp bilde","image_is_not_a_square":"Vi har beskjært bildet ditt, høyde og bredde er ikke lik"},"change_profile_background":{"title":"Profilbakgrunn","instructions":"Profil bakgrunner vil bli sentrert med en standard bredde på 850px"},"change_card_background":{"title":"Brukerkort bakgrunn","instructions":"Bakgrunnsbilder vil bli sentrert og ha en standard bredde på 590px."},"email":{"title":"E-post","instructions":"Blir aldri vist offentlig","ok":"Vi sender deg en e-post for å bekrefte","invalid":"Vennligst oppgi en gyldig e-postadresse","authenticated":"Din e-post har blitt autentisert av {{provider}}"},"name":{"title":"Navn","instructions":"Ditt fulle navn (valgfritt)","instructions_required":"Ditt fulle navn","too_short":"Navnet ditt er for kort.","ok":"Navnet ditt ser bra ut."},"username":{"title":"Brukernavn","instructions":"Unikt, kort og uten mellomrom.","short_instructions":"Folk kan nevne deg som @{{username}}.","available":"Ditt brukernavn er tilgjengelig.","global_match":"E-post stemmer med det registrerte brukernavnet","global_mismatch":"Allerede registrert. Prøv {{suggestion}}?","not_available":"Ikke tilgjengelig. Prøv {{suggestion}}?","too_short":"Ditt brukernavn er for kort.","too_long":"Ditt brukernavn er for langt.","checking":"Sjekker brukernavnets tilgjengelighet...","enter_email":"Brukernavn funnet; oppgi samsvarende e-post","prefilled":"E-post stemmer med dette registrerte brukernavnet"},"locale":{"title":"Språk for grensesnitt","instructions":"Språk for grensesnitt. Endringen vil tre i kraft når du oppdaterer siden.","default":"(standard)"},"password_confirmation":{"title":"Passord igjen"},"last_posted":"Siste Innlegg","last_emailed":"Sist kontaktet","last_seen":"Sist sett","created":"Medlem fra","log_out":"Logg ut","location":"Posisjon","card_badge":{"title":"Brukerkort merke"},"website":"Nettsted","email_settings":"E-post","email_digests":{"title":"Send meg sammendrag av hva som er nytt på e-post når jeg ikke er ofte innom:","daily":"daglig","every_three_days":"hver tredje dag","weekly":"ukentlig","every_two_weeks":"annenhver uke"},"email_direct":"Motta en e-post når noen siterer deg, svarer på dine innlegg, nevner ditt brukernavn eller inviterer deg til et emne","email_private_messages":"Motta en e-post når noen sender deg en melding","email_always":"Send meg varsler på epost selv når jeg er aktiv på nettstedet","other_settings":"Annet","categories_settings":"Kategorier","new_topic_duration":{"label":"Anse emner som nye når","not_viewed":"Jeg har ikke sett på dem enda.","last_here":"opprettet siden jeg var her sist"},"auto_track_topics":"Følg automatisk emner jeg åpner","auto_track_options":{"never":"aldri","immediately":"øyeblikkelig"},"invited":{"search":"skriv for å søke etter invitasjoner...","title":"invitasjoner","user":"Invitert bruker","sent":"Sendt","redeemed":"Løs inn invitasjoner","redeemed_tab":"Brukt","redeemed_at":"Løst inn ved","pending":"Ventende invitasjoner","pending_tab":"På vent","topics_entered":"Emner vist","posts_read_count":"Innlegg lest","expired":"Denne invitasjonen har utløpt","rescind":"Fjern","rescinded":"Invitasjon fjernet","reinvite":"Send invitasjon igjen","reinvited":"Invitasjon sendt igjen","time_read":"Lesetid","days_visited":"Dager besøkt","account_age_days":"Kontoalder i dager","create":"Send en invitasjon","bulk_invite":{"none":"Du har ikke invitert noen hit enda. Du kan sende individuelle invitasjoner, eller invitere en gruppe folk på en gang ved å \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003elaste opp en fil med flere invitasjoner\u003c/a\u003e.","text":"Masseinvitasjon fra fil","uploading":"Laster opp...","success":"Filen er lastet opp, du vil motta en melding når prosessesen er ferdig","error":"En feil oppsto ved opplastingen av '{{filename}}': {{message}}"}},"password":{"title":"Passord","too_short":"Passordet ditt er for kort","common":"Det passordet er for vanlig.","same_as_username":"Ditt passord er det samme som ditt brukernavn.","same_as_email":"Ditt passord er det samme som din e-post.","ok":"Passordet ditt ser bra ut","instructions":"Minst %{count} tegn."},"associated_accounts":"Innloggingsforsøk","ip_address":{"title":"Siste IP-adresse"},"registration_ip_address":{"title":"Registreringens IP-adresse."},"avatar":{"title":"Profilbilde","header_title":"Profil, meldinger, bokmerker og innstillinger"},"title":{"title":"Tittel"},"filters":{"all":"Alle"},"stream":{"posted_by":"Skrevet av","sent_by":"Sendt av","private_message":"melding","the_topic":"emnet"}},"loading":"Laster...","errors":{"prev_page":"ved lasting","reasons":{"network":"Nettverksfeil","server":"Serverfeil","forbidden":"Tilgang avslått","unknown":"Feil"},"desc":{"network":"Vennligst sjekk nettverkstilkoblingen din","network_fixed":"Ser ut som om den er tilbake.","server":"Feilkode: {{status}}","forbidden":"Du har ikke tilgang til dette.","unknown":"Noe gikk galt."},"buttons":{"back":"Gå tilbake","again":"Prøv igjen","fixed":"Last side"}},"close":"Lukk","assets_changed_confirm":"Dette nettstedet ble nettopp oppdatert. Oppdater nå for nyeste versjon?","logout":"Du ble logget ut","refresh":"Refresh","read_only_mode":{"enabled":"Skrivebeskyttet modus er aktivert. Du kan fortsette å benytte siden med enkelte funksjoner vil muligens ikke fungere.","login_disabled":"Innlogging er deaktivert mens nettsiden er i skrivebeskyttet modus."},"learn_more":"lær mer...","year":"år","year_desc":"emner opprettet de siste 365 dagene","month":"måned","month_desc":"emner opprettet de siste 30 dagene","week":"uke","week_desc":"emner opprettet de siste 7 dagene","day":"dag","first_post":"Første innlegg","mute":"Demp","unmute":"Fjern demping","last_post":"Siste innlegg","last_reply_lowercase":"siste svar","replies_lowercase":{"one":"svar","other":"svar"},"signup_cta":{"sign_up":"Registrer deg","hide_session":"Spør meg igjen i morgen","hide_forever":"nei takk","hidden_for_session":"OK, jeg spør igjen i morgen. Du kan også registrere en konto når du vil!","intro":"Hei du! :heart_eyes: Det ser ut som du følger diskusjonen, men ikke har registrert deg enda.","value_prop":"Når du registrerer deg husker vi hvor langt du har lest, så du starter på riktig sted neste gang du åpner en tråd. Du får også varsler, her og på e-post når det skjer ting i diskusjonene du vil følge. I tillegg kan du like innlegg :heartbeat:"},"summary":{"enabled_description":"Du ser for øyeblikket en oppsummering av dette emnet: de mest interessante innleggene i følge nettsamfunnet.","description":"Det er \u003cb\u003e{{count}}\u003c/b\u003e svar.","description_time":"Det er \u003cb\u003e{{count}}\u003c/b\u003e svar med en estimert lesetid på \u003cb\u003e{{readingTime}} minutter\u003c/b\u003e.","enable":"Oppsummer dette emnet","disable":"Vis alle innlegg"},"deleted_filter":{"enabled_description":"Dette emnet inneholder slettede innlegg som har blitt skjult.","disabled_description":"Slettede innlegg i emnet vises.","enable":"Skjul slettede innlegg","disable":"Vis slettede innlegg"},"private_message_info":{"title":"Send","invite":"Inviter andre...","remove_allowed_user":"Er du sikker på at du vil fjerne {{name}} fra denne meldingen?"},"email":"E-post","username":"Brukernavn","last_seen":"Sist sett","created":"Opprettet","created_lowercase":"opprettet","trust_level":"Tillitsnivå","search_hint":"brukernavn, e-post eller IP-adresse","create_account":{"title":"Opprett ny konto","failed":"Noe gikk galt, kanskje denne e-postadressen allerede er registrert. Prøv lenke for glemt passord"},"forgot_password":{"title":"Nullstill Passord","action":"Glemt passord","invite":"Skriv inn ditt brukernavn eller din e-postadresse, så sender vi deg en e-post for å nullstille ditt passord.","reset":"Nullstill passord","complete_username":"Hvis en konto med brukernavn \u003cb\u003e%{username}\u003c/b\u003e finnes vil du motta en e-post om kort tid med instruksjoner om hvordan du kan nullstille passordet.","complete_email":"Hvis en konto med e-postadressen \u003cb\u003e%{email}\u003c/b\u003e eksisterer i systemet vil du om kort tid motta en e-post med instruksjoner om hvordan du kan nullstille passordet.","complete_username_found":"Vi fant en konto med brukernavn \u003cb\u003e%{username}\u003c/b\u003e. Du mottar om litt en e-post med instruksjoner for hovrdan du nullstiller passordet.","complete_email_found":"Vi fant en konto med e-postadressen \u003cb\u003e%{email}\u003c/b\u003e. Du mottar om litt en e-post med instruksjoner for hvordan du nullstiller passordet.","complete_username_not_found":"Ingen konto har med brukernavnet \u003cb\u003e%{username}\u003c/b\u003e er registrert","complete_email_not_found":"Ingen konto med e-postadressen \u003cb\u003e%{email}\u003c/b\u003e er registrert"},"login":{"title":"Logg Inn","username":"Bruker","password":"Passord","email_placeholder":"e-postadresse eller brukernavn","caps_lock_warning":"Caps Lock er på","error":"Ukjent feil","rate_limit":"Vennligst vent litt før du logger inn igjen.","blank_username_or_password":"Vennligst oppgi din e-postadresse eller brukernavn og ditt passord.","reset_password":"Nullstill passord","logging_in":"Logger på...","or":"Eller","authenticating":"Autentiserer...","awaiting_confirmation":"Din konto avventer aktivering. Bruk lenken for glemt passord for å sende en ny e-post for aktivering.","awaiting_approval":"Din konto har ikke blitt godkjent av en moderator ennå. Du vil motta en e-post når den er godkjent.","requires_invite":"Beklager, tilgang til dette forumet er kun ved invitasjon.","not_activated":"Du kan ikke logge inn ennå. Vi sendte en e-post for aktivering til deg på \u003cb\u003e{{sentTo}}\u003c/b\u003e. Vennligst følg instruksjonene i den e-posten for å aktivere din konto.","not_allowed_from_ip_address":"Du kan ikke logge inn fra den IP-adressen.","admin_not_allowed_from_ip_address":"Du kan ikke logge inn som administrator fra den IP-adressen.","resend_activation_email":"Klikk her for å sende e-posten for aktivering igjen.","sent_activation_email_again":"Vi sendte deg en ny e-post for aktivering på \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Det kan ta noen minutter før den kommer fram; sørg for at du sjekker nettsøppel om du ikke finner den.","google":{"title":"med Google","message":"Autentiserer med Google (sørg for at du tillater pop-up vindu)"},"google_oauth2":{"title":"med Google","message":"Autentiserer med Google (sørg for at du tillater pop-up vindu)"},"twitter":{"title":"med Twitter","message":"Autentiserer med Twitter (sørg for at du tillater pop-up vindu)"},"facebook":{"title":"med Facebook","message":"Autentiserer med Facebook (sørg for at du tillater pop-up vindu)"},"yahoo":{"title":"med Yahoo","message":"Autentiserer med Yahoo (sørg for at du tillater pop-up vindu)"},"github":{"title":"med GitHub","message":"Autentiserer med GitHub (sørg for at du tillater pop-up vindu)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","composer":{"emoji":"Emoji :smile:","more_emoji":"mer...","options":"Alternativer","add_warning":"Dette er en offisiell advarsel.","posting_not_on_topic":"Du svarer på emnet \"{{title}}\", men for øyeblikket ser du på et annet emne.","saving_draft_tip":"lagrer...","saved_draft_tip":"lagret","saved_local_draft_tip":"lagret lokalt","similar_topics":"Emnet ditt har likheter med...","drafts_offline":"utkast offline","error":{"title_missing":"Tittel er påkrevd","title_too_short":"Tittel må være minst {{min}} tegn","title_too_long":"Tittel kan ikke være mer enn {{max}} tegn","post_missing":"Innlegget kan ikke være tomt","post_length":"Innlegget må være minst {{min}} tegn","try_like":"Har du prøvd \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e knappen?","category_missing":"Du må velge en kategori"},"save_edit":"Lagre endring","reply_original":"Besvar det originale emnet","reply_here":"Svar her","reply":"Svar","cancel":"Avbryt","create_topic":"Nytt Emne","create_pm":"Melding","title":"Eller trykk Ctrl+Enter","users_placeholder":"Legg til en bruker","title_placeholder":"Oppsummert i en setning, hva handler denne diskusjonen om?","edit_reason_placeholder":"hvorfor endrer du?","show_edit_reason":"(legg till endringsbegrunnelse)","view_new_post":"Se ditt nye innlegg.","saved":"Lagret!","saved_draft":"Innleggsutkast. Velg for å fortsette.","uploading":"Laster opp...","show_preview":"se forhånsvisning \u0026raquo;","hide_preview":"\u0026laquo; skjul forhåndsvisning","quote_post_title":"Siter hele innlegget","bold_title":"Sterk","bold_text":"sterk tekst","italic_title":"Kursiv","italic_text":"kursiv tekst","link_title":"Hyperlenke","link_description":"beskriv lenken her","link_dialog_title":"Sett inn hyperlenke","link_optional_text":"valgfri tittel","quote_title":"Sitatramme","quote_text":"Sitatramme","code_title":"Kode Utsnitt","code_text":"Skriv inn preformattert tekst med 4 mellomroms innrykk.","upload_title":"Bilde","upload_description":"beskriv bildet her","olist_title":"Nummerert Liste","ulist_title":"Kulepunkt Liste","list_item":"Listeelement","heading_title":"Overskrift","heading_text":"Overskrift","hr_title":"Horisontalt Skille","help":"Hjelp for redigering i Markdown","toggler":"gjem eller vis redigeringspanelet","admin_options_title":"Valgfrie emne-instillinger for ansatte","auto_close":{"label":"Tid for auto-lukking av emnet:","error":"Vennligst skriv en gyldig verdi.","based_on_last_post":"Ikke lukk før den siste posten i emnet er minst så gammel.","all":{"examples":"Før inn antall timer (24), absolutt tid (17:30) eller tidsstempel (2013-11-22 14:00)."},"limited":{"units":"(# timer)","examples":"Før inn antall timer (24)."}}},"notifications":{"title":"varsler om at ditt @navn blir nevnt, svar på dine innlegg, emner, meldinger, osv","none":"Notifikasjoner er ikke tilgjengelig for øyeblikket.","more":"se gamle varsler","total_flagged":"totalt rapporterte innlegg","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eBle tildelt '{{description}}'\u003c/p\u003e","popup":{"mentioned":"{{username}} nevnte deg i \"{{topic}}\" - {{site_title}}","quoted":"{{username}} siterte deg i \"{{topic}}\" - {{site_title}}","replied":"{{username}} svarte deg i \"{{topic}}\" - {{site_title}}","posted":"{{username}} skrev i \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sendte deg en privat melding: \"{{topic}}\" - {{site_title}}","linked":"{{username}} lenket til ditt innlegg i \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Legg til Bilde","title_with_attachments":"Legg til et bilde eller en fil","from_my_computer":"Fra Min Enhet","from_the_web":"Fra nettet","remote_tip":"link til bilde","local_tip":"velg bilder fra din enhet","hint":"(du kan også drag \u0026 drop inn i editoren for å laste dem opp)","uploading":"Laster opp bilde","select_file":"Velg Fil","image_link":"lenken som bildet skal peke til"},"search":{"title":"søk etter emner, innlegg, brukere eller kategorier","no_results":"Ingen resultater funnet.","no_more_results":"Ingen flere resultater funnet.","search_help":"Søkehjelp","searching":"Søker ...","post_format":"#{{post_number}} av {{username}}","context":{"user":"Søk innleggene av @{{username}}","category":"Søk i kategorien \"{{category}}\"","topic":"Søk i dette emnet","private_messages":"Søk i meldinger"}},"go_back":"gå tilbake","not_logged_in_user":"brukerside med oppsummering av nylig aktivtet og preferanser.","current_user":"go til din brukerside","topics":{"bulk":{"reset_read":"Nullstill lest","delete":"Slett Emne","dismiss_new":"Lest","toggle":"Veksle mellom massevelging av emner","actions":"Massehandlinger","change_category":"Endre Kategori","close_topics":"Lukk Emner","archive_topics":"Arkiverte emner","notification_level":"Endre varslingsnivå","choose_new_category":"Velg den nye kategorien for emnene:","selected":{"one":"Du har valgt \u003cb\u003e1\u003c/b\u003e emne.","other":"Du har valgt \u003cb\u003e{{count}}\u003c/b\u003e emner."}},"none":{"unread":"Du har ingen uleste emner å lese.","new":"Du har ingen nye emner å lese.","read":"Du har ikke lest noen emner enda.","posted":"Du har ikke postet i noen emner enda.","latest":"Det er ingen siste emner. Det er trist.","hot":"Det er ingen populære emner.","bookmarks":"Du har ingen bokmerkede emner.","category":"Det er ingen {{category}} emner.","top":"Det er ingen populære emner.","search":"Det er ingen søkeresultater","educate":{"new":"\u003cp\u003eDine nye emner vises her.\u003c/p\u003e\u003cp\u003eSom standard anses emner som nye, og vil ha indikatoren \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eny\u003c/span\u003e hvis emnet ble opprettet de siste 2 dagene\u003c/p\u003e\u003cp\u003eDu kan endre dette i dine \u003ca href=\"%{userPrefsUrl}\"\u003einnstillinger\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eDine uleste emner vises her.\u003c/p\u003e\u003cp\u003eSom standard anses emner som uleste, og vil vise antall uleste \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e dersom du:\u003c/p\u003e\u003cul\u003e\u003cli\u003eOpprettet emnet\u003c/li\u003e\u003cli\u003eSvarte på emnet\u003c/li\u003e\u003cli\u003eLeste emnet i mer enn 4 minutter\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eEller dersom du eksplisitt har satt emnet som Sporet eller Fulgt via varslingskontrollene under hvert emne.\u003c/p\u003e\u003cp\u003eDu kan endre dette i dine \u003ca href=\"%{userPrefsUrl}\"\u003einnstillinger\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Det er ikke noen siste emner igjen å lese.","hot":"Det er ikke noen populære emner igjen å lese.","posted":"Det er ikke noen postede emner igjen å lese.","read":"Det er ikke noen leste emner igjen å lese.","new":"Det er ikke noen nye emner igjen å lese.","unread":"Det er ikke noen uleste emner igjen å lese.","category":"Det er ikke noen {{category}} emner igjen.","top":"Det er ingen flere populære emner.","bookmarks":"Det er ingen bokmerkede emner.","search":"Det er ingen flere søkeresultater"}},"topic":{"filter_to":"{{post_count}} innlegg i dette emnet.","create":"Nytt emne","create_long":"Opprett et nytt emne","private_message":"Begynn en melding","list":"Emner","new":"nytt emne","unread":"ulest","new_topics":{"one":"Ett nytt emne","other":"{{count}} nye emner"},"unread_topics":{"one":"Ett ulest emne","other":"{{count}} uleste emner"},"title":"Emne","invalid_access":{"title":"Emnet er privat","description":"Beklager, du har ikke tilgang til det emnet!","login_required":"Du må være logget inn for å lese dette emnet."},"server_error":{"title":"Emnet kunne ikke bli behandlet","description":"Beklager, vi kunne ikke behanldle det emnet, muligens på grunn av et tilkoblingsproblem. Vennligst prøv igjen. Om problemet vedvarer, fortell oss."},"not_found":{"title":"Emnet kunne ikke bli funnet","description":"Beklager, vi kunne ikke finne det emnet. Kanskjer det ble fjernet av en moderator?"},"total_unread_posts":{"one":"du har 1 ulest innlegg i dette emnet","other":"du har {{count}} uleste innlegg i dette emnet"},"unread_posts":{"one":"du har 1 ulest gammelt innlegg i dette emnet","other":"du har {{count}} uleste gamle innlegg i dette emnet"},"new_posts":{"one":"Det er 1 nytt innlegg i dette emnet siden sist du leste det","other":"Det er {{count}} nye innlegg i dette emnet siden sist du leste det"},"likes":{"one":"det er 1 liker i dette emnet","other":"det er {{count}} liker i dette emnet"},"back_to_list":"Tilbake til Emnelisten","options":"Valg for Emner","show_links":"vis lenker i dette emnet","toggle_information":"vis/skjul emnedetaljer","read_more_in_category":"Vil du lese mer? Bla gjennom andre emner i {{catLink}} eller {{latestLink}}.","read_more":"Vil du lese mer? {{catLink}} eller {{latestLink}}.","browse_all_categories":"Se alle kategorier","view_latest_topics":"se siste emner","suggest_create_topic":"Hvorfor ikke opprette et emne?","jump_reply_up":"hopp til tidligere svar","jump_reply_down":"hopp til senere svar","deleted":"Emnet har blitt slettet","auto_close_notice":"Dette emnet vil automatisk lukkes %{timeLeft}.","auto_close_notice_based_on_last_post":"Dette emnet vil bli lukket %{duration} etter det siste innlegget.","auto_close_title":"Auto-Lukk Innstillinger","auto_close_save":"Lagre","auto_close_remove":"Ikke lukk dette emnet automatisk","progress":{"title":"emnefrangang","go_top":"topp","go_bottom":"bunn","go":"Gå","jump_bottom":"Hopp til nyeste innlegg","jump_bottom_with_number":"hopp til innlegg %{post_number}","total":"innlegg totalt","current":"gjeldende innlegg","position":"innlegg %{current} av %{total}"},"notifications":{"reasons":{"3_6":"Du vil motta varsler fordi du følger denne kategorien","3_5":"Du vil motta varsler fordi du startet å følge dette emnet automatisk.","3_2":"Du vil motta varsler fordi du følger dette emnet.","3_1":"Du vil motta varsler fordi du opprettet dette emnet.","3":"Du vil motta varsler fordi du følger dette emnet.","2_8":"Du vil motta varsler fordi du følger denne kategorien.","2_4":"Du vil motta varsler fordi du svarte på dette emnet.","2_2":"Du vil motta varsler fordi du følger dette emnet.","2":"Du vil motta varsler fordi du \u003ca href=\"/users/{{username}}/preferences\"\u003eread this topic\u003c/a\u003e.","1_2":"Du vil bli varslet om noen nevner ditt @navn eller svarer på ditt innlegg.","1":"Du vil bli varslet om noen nevner ditt @navn eller svarer på ditt innlegg.","0_7":"Du ignorerer alle varsler i denne kategorien.","0_2":"Du ignorerer alle varsler på dette emnet.","0":"Du ignorerer alle varsler på dette emnet."},"watching_pm":{"title":"Følger","description":"Du vil bli varslet om hvert nye innlegg i denne meldingen. Antall nye tilbakemeldinger vil også bli vist. "},"watching":{"title":"Følger","description":"Du vil bli varslet om hvert nye innlegg i dette emnet. Antall nye tilbakemeldinger vil også bli vist. "},"tracking_pm":{"title":"Følger","description":"Antall nye tilbakemeldinger vil bli vist for denne meldingen. Du vil bli varslet om noen nevner ditt @name eller svarer på din melding. "},"tracking":{"title":"Følger","description":"Antall nye svar vil bli vist for dette emnet. Du vil bli varslet om noen nevner ditt @name eller svarer på ditt innlegg.. "},"regular":{"title":"Normal","description":"Du vil bli varslet om noen nevner ditt @navn eller svarer på ditt innlegg."},"regular_pm":{"title":"Normal","description":"Du vil bli varslet om noen nevner ditt @navn eller svarer på ditt innlegg."},"muted_pm":{"title":"Dempet","description":"Du vil ikke få varslinger om noe i denne meldingnen. "},"muted":{"title":"Dempet"}},"actions":{"recover":"Gjenopprett emne","delete":"slett emne","open":"Åpne Emne","close":"Lukk Emne","multi_select":"Velg Innlegg...","auto_close":"Lukk Automatisk","pin":"Feste emnet...","unpin":"Løsgjør Emne","unarchive":"Uarkiver Emne","archive":"Arkiver Emne","invisible":"Skjul Emnet","visible":"Vist Emnet","reset_read":"Tilbakestill Lesedata"},"feature":{"pin":"Fest Emnet","unpin":"Løsgjør Emnet","pin_globally":"Fest Emnet Globalt","make_banner":"Banneremne","remove_banner":"Fjern Banneremne"},"reply":{"title":"Svar","help":"begynn å skrive et svar til dette emnet"},"clear_pin":{"title":"Løsgjør emne","help":"Løsgjør fastsatt-statusen til dette emnet så det ikke lenger vises på toppen av din emneliste"},"share":{"title":"Del","help":"del en lenke til dette emnet"},"flag_topic":{"title":"Rapporter","help":"rapporter dette innlegget privat eller send et privat varsel om det","success_message":"Du har rapportert dette emnet"},"feature_topic":{"title":"Fremhev dette emnet","confirm_pin":"Du har allerede {{count}} låste emner. For mange låste emner kan være et problem for nye og anonyme brukere. Er du sikker på at du ønsker å låse et til emne i denne kategorien?","unpin":"Fjern dette emnet fra toppen av {{categoryLink}} kategorien.","pin_note":"Brukere kan låse opp emnet selv.","confirm_pin_globally":"Du har allerede {{count}} globalt låste emner. For mange låste emner kan bli en byrde for nye og anonyme brukere. Er du sikker på at du vil låse et til emne globalt? ","unpin_globally":"Fjern dette emnet fra toppen av alle emnelister. ","global_pin_note":"Brukere kan låse opp emner for dem selv. ","make_banner":"Gjør dette emnet til et banner som dukker opp på toppen av alle sider.","remove_banner":"Fjern banneret som dukker opp på toppen av alle sider. ","banner_note":"Brukere kan fjerne banneret ved å lukke det. Kun et emne kan være banner på en og samme tid. "},"inviting":"Inviterer...","automatically_add_to_groups_optional":"Denne invitasjonen inkluderer også tilgang på disse gruppene: (valgfritt, kun for admin)","automatically_add_to_groups_required":"Denne invitasjonen inkluderer også tilgang til disse gruppene: (\u003cb\u003epåkrevet\u003c/a\u003e, kun for admin)","invite_private":{"title":"Inviter til samtale","email_or_username":"Invitertes e-post eller brukernavn.","email_or_username_placeholder":"e-postadresse eller brukernavn","action":"Inviter","success":"Vi har invitert denne brukeren til å delta i denne meldingen.","error":"Beklager, det oppstod en feil ved å invitere den brukeren.","group_name":"gruppenavn"},"invite_reply":{"title":"Inviter","username_placeholder":"brukernavn","action":"Send Invitasjon","help":"Inviter andre til dette emnet via epost eller varsler","to_forum":"Vi sender en kortfattet e-post som gjør det mulig for en venn å umiddelbart registreres ved å klikke på en lenke. Ingen innlogging er nødvendig.","sso_enabled":"Oppgi brukernavnet til personen du ønsker å invitere til dette emnet.","to_topic_blank":"Oppgi brukernavnet eller epost-adressen til personen du ønsker å invitere til dette emnet.","to_topic_email":"Du har oppgitt en epostadresse. Vi vil sende invitasjonen som later vennen din umiddelbart svare på dette emnet.","to_topic_username":"Du har oppgitt et brukernavn. Vi sender et varsel med en link som inviterer dem til dette emnet.","to_username":"Oppgi brukernavnet til personen du ønsker å invitere. Vi sender et varsel med en lenke som inviterer dem til dette emnet.","email_placeholder":"navn@example.com","success_email":"Vi har sendt ut en invitasjon til \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Vi varsler deg når invitasjonen er godtatt. Sjekk invitiasjonsfanen på brukersiden din for å holde styr på invitasjonene dine.","success_username":"Vi har invitert brukeren til å delta i dette emnet.","error":"Beklager, vi kunne ikke invitere den brukeren. De har muligens allerede blitt invitert?"},"login_reply":"Logg Inn for å svare","filters":{"n_posts":{"one":"1 innlegg","other":"{{count}} innlegg"},"cancel":"Fjern filter"},"split_topic":{"title":"Del opp Emne","action":"del opp emne","topic_name":"Nytt Emnenavn:","error":"Det oppsto en feil ved deling av dette emnet.","instructions":{"one":"Du er i ferd med å lage et nytt emne basert på innlegget du har valgt..","other":"Du er i ferd med å lage et nytt emne basert på \u003cb\u003e{{count}}\u003c/b\u003e innlegg du har valgt."}},"merge_topic":{"title":"Slå sammen Emne","action":"slå sammen emne","error":"Det oppsto en feil ved sammenslåing av dette emnet.","instructions":{"one":"Vennligst velg det emnet du vil flytte det innlegget til.","other":"Vennligst velg emnet du vil flytte de \u003cb\u003e{{count}}\u003c/b\u003e innleggene til."}},"change_owner":{"title":"Endre innleggenes eier","action":"Endre eierskap","error":"Det oppsto en feil ved endring av eierskap til innleggene.","label":"Innleggenes nye eier","placeholder":"den nye eierens brukernavn","instructions":{"one":"Velg den nye eieren til innlegget av \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Velg den nye eieren til {{count}} innlegg av  \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Merk at ingen varsler om dette innlegget vil overføres til den nye eieren i etterkant.\u003cbr\u003eAdvarsel: For øyeblikket blir ingen innleggsavhengige data overført til den nye brukeren. Bruk med omhu."},"multi_select":{"select":"velg","selected":"valgte ({{count}})","select_replies":"velg +svar","delete":"fjern valgte","cancel":"avbryt valg","select_all":"velg alle","deselect_all":"fjern alle","description":{"one":"Du har valgt \u003cb\u003e1\u003c/b\u003e innlegg.","other":"Du har valgt \u003cb\u003e{{count}}\u003c/b\u003e innlegg."}}},"post":{"quote_reply":"siter svar","edit":"Redigerer {{link}} {{replyAvatar}} {{username}}","edit_reason":"Begrunnelse:","post_number":"post {{number}}","last_edited_on":"innlegg sist redigert","reply_as_new_topic":"Svar med lenket emne","continue_discussion":"Fortsetter diskusjonen fra {{postLink}}:","follow_quote":"gå til det siterte innlegget","show_full":"Vis hele posten","show_hidden":"Se skjult innhold","deleted_by_author":{"one":"(innlegg som er trukket tilbake av forfatter, blir automatisk slettet etter % {count} time, med mindre de blir flagget)","other":"(innlegg trukket tilbake av forfatter, blir automatisk slettet etter %{count} timer, med mindre det blir rapportert)"},"expand_collapse":"utvid/vis","gap":{"one":"vis 1 skjult svar","other":"vis {{count}} skjulte svar"},"more_links":"{{count}} flere...","unread":"Innlegget er ulest","has_replies":{"one":"{{count}} Svar","other":"{{count}} Svar"},"has_likes":{"one":"{{count}} Like","other":"{{count}} liker"},"has_likes_title":{"one":"{{count}} bruker likte dette innlegget","other":"{{count}} brukere likte dette innlegget"},"has_likes_title_only_you":"du likte dette innlegget","has_likes_title_you":{"one":"du og 1 annen bruker likte dette innlegget","other":"du og {{count}} andre likte dette innlegget"},"errors":{"create":"Beklager, det oppstod en feil ved å publisere ditt innlegg. Vennligst prøv igjen.","edit":"Beklager, det oppstod en feil ved redigeringen av ditt innlegg. Vennligst prøv igjen.","upload":"Sorry, there was an error uploading that file. Please try again.","attachment_too_large":"Beklager, filen du prøver å laste opp er for stor (maksimal størrelsen er {{max_size_kb}}kb).","file_too_large":"Beklager, filen du prøver å laste opp er for stor (maximum size is {{max_size_kb}}kb)","too_many_uploads":"Beklager, du kan bare laste opp ett bilde om gangen.","too_many_dragged_and_dropped_files":"Beklager, du kan bare flytte opp til 10 filer om gangen.","upload_not_authorized":"Beklager, filen du prøver å laste opp er ikke godkjent (godkjente filtyper: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Beklager, nye brukere kan ikke laste opp bilder","attachment_upload_not_allowed_for_new_user":"Beklager, nye brukere kan ikke laste opp vedlegg.","attachment_download_requires_login":"Beklager, du må være logget inn for å laste ned vedlegg."},"abandon":{"confirm":"Er du sikker på at du vil forlate innlegget ditt?","no_value":"Nei","yes_value":"Ja"},"via_email":"Dette innlegget ankom via e-post","wiki":{"about":"Dette innlegget er en wiki; brukere kan redigere den"},"archetypes":{"save":"Lagre Alternativene"},"controls":{"reply":"begynn å skrive et svar til dette innlegget","like":"lik dette innlegget","has_liked":"du liker dette innlegget","undo_like":"angre liker","edit":"rediger dette innlegget","edit_anonymous":"Beklager, du må være innlogget for å endre dette innlegget.","flag":"rapporter dette innlegget privat eller send et privat varsel om det","delete":"slett dette innlegget","undelete":"gjenopprett dette innlegget","share":"del en lenke til dette innlegget","more":"Mer","delete_replies":{"confirm":{"one":"Vil du òg slette det direkte svaret til dette innlegget?","other":"Vil du òg slette de {{count}} direkte svarene til dette innlegget?"},"yes_value":"Ja, slett svarene også.","no_value":"Nei, kun dette innlegget."},"admin":"Innleggsadministrasjon","wiki":"Opprett wiki","unwiki":"Fjern Wiki","convert_to_moderator":"Legg til stabsfarge","revert_to_regular":"Fjern stabsfarge","rebake":"Gjenoppbygg HTML","unhide":"Vis"},"actions":{"flag":"Rapportering","defer_flags":{"one":"Utsett rapportering","other":"Utsett rapporteringer"},"it_too":{"off_topic":"Rapporter det også","spam":"Rapporter det også","inappropriate":"Rapporter det også","custom_flag":"Rapporter det også","bookmark":"Bokmerk det også","like":"Lik det også","vote":"Stem for det også"},"undo":{"off_topic":"Angre rapportering","spam":"Angre rapportering","inappropriate":"Angre rapportering","bookmark":"Angre bokmerke","like":"Angre liker","vote":"Angre stemme"},"people":{"off_topic":"{{icons}} rapporterte dette som irrelevant","spam":"{{icons}} rapporterte dette som spam","spam_with_url":"{{icons}} merket \u003ca href='{{postUrl}}'\u003edette som spam\u003c/a\u003e","inappropriate":"{{icons}} rapporterte dette som upassende","notify_moderators":"{{icons}} varslet moderatorene","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003evarslet moderatorene\u003c/a\u003e","notify_user":"{{icons}} sendte en melding","notify_user_with_url":"{{icons}} sente en \u003ca href='{{postUrl}}'\u003emelding\u003c/a\u003e","bookmark":"{{icons}} bokmerket dette","like":"{{icons}} likte dette","vote":"{{icons}} stemte for dette"},"by_you":{"off_topic":"Du rapporterte dette som irrelevant","spam":"Du rapporterte dette som spam","inappropriate":"Du rapporterte dette som upassende","notify_moderators":"Du rapporterte dette for moderering","notify_user":"Du sendte en melding til denne brukeren","bookmark":"Du bokmerket dette innlegget","like":"Du likte dette","vote":"Du stemte for dette innlegget"},"by_you_and_others":{"off_topic":{"one":"Du og 1 annen markerte dette som irrelevant","other":"Du og {{count}} andre rapporterte dette som irrelevant"},"spam":{"one":"Du og 1 annen markerte dette som spam","other":"Du og {{count}} andre rapporterte dette som spam"},"inappropriate":{"one":"Du og 1 annen markerte dette som upassende","other":"Du og {{count}} andre rapporterte dette som upassende"},"notify_moderators":{"one":"Du og 1 annen markerte dette for moderering","other":"Du og {{count}} andre rapporterte dette for moderering"},"notify_user":{"one":"Du og 1 annen bruker sendte en melding til denne brukeren","other":"Du og {{count}} andre brukere har sendt en melding til denne brukeren"},"bookmark":{"one":"Du og 1 annen bokmerket dette innlegget","other":"Du og {{count}} andre bokmerket dette innlegget"},"like":{"one":"Du og 1 annen likte dette","other":"Du og {{count}} andre likte dette"},"vote":{"one":"Du og 1 annen stemte på dette innlegget","other":"Du og {{count}} andre stemte på dette innlegget"}},"by_others":{"off_topic":{"one":"1 bruker markerte dette som irrelevant","other":"{{count}} brukere rapporterte dette som irrelevant"},"spam":{"one":"1 bruker markerte dette som spam","other":"{{count}} brukere rapporterte dette som spam"},"inappropriate":{"one":"1 bruker markerte dette som upassende","other":"{{count}} brukere rapporterte dette som upassende"},"notify_moderators":{"one":"1 bruker markerte dette for moderering","other":"{{count}} brukere rapporterte dette for moderering"},"notify_user":{"one":"1 person har sendt en melding til denne brukeren","other":"{{count}} har sendt en melding til denne brukeren"},"bookmark":{"one":"1 bruker bokmerket dette innlegget","other":"{{count}} brukere bokmerket dette innlegget"},"like":{"one":"1 bruker likte dette","other":"{{count}} brukere likte dette"},"vote":{"one":"1 bruker stemte på dette innlegget","other":"{{count}} brukere stemte på dette innlegget"}}},"delete":{"confirm":{"one":"Er du sikker på at du vil slette det innlegget?","other":"Er du sikker på at du vil slette alle de innleggene?"}},"revisions":{"controls":{"first":"Første revisjon","previous":"Forrige revisjon","next":"Neste revisjon","last":"Siste revisjon","hide":"Skjul revisjon","show":"Vis revisjon","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Vis endelig tekst med endringene der de er gjort","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Vis endringer i endelig tekst side ved side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Vis diff for kilderåtekst side ved side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Raw"}}}},"category":{"can":"kan\u0026hellip;","none":"(no category)","all":"Alle kategorier","choose":"Velg en katekori\u0026hellip;","edit":"rediger","edit_long":"Rediger","view":"Se Emner i Kategori","general":"Generellt","settings":"Innstillinger","topic_template":"Emnemal","delete":"Slett kategori","create":"Ny Kategori","create_long":"Opprett en ny kategori","save":"Lagre Kategori","slug":"Kategorinavn i URL","slug_placeholder":"(valgfritt) sammensatte ord for bruk i URL","creation_error":"Det oppstod en feil ved å lage denne kategorien.","save_error":"Det oppstod en feil ved lagrinen av denne kategorien.","name":"Kategorinavn","description":"Beskrivelse","topic":"kategori emne","logo":"Kategoribilde","background_image":"Kategoriens bakgrunnsbilde","badge_colors":"Merkefarger","background_color":"Bakgrunnsfarge","foreground_color":"Forgrunnsfarge","name_placeholder":"Bør være kortfattet.","color_placeholder":"Enhver webfarge","delete_confirm":"Er du sikker på at du vil slette denne kategorien?","delete_error":"Det oppstod en feil ved å slette denne kategorien.","list":"List Kategorier","no_description":"Vennligst legg til en beskrivelse for denne kategorien.","change_in_category_topic":"Rediger Beskrivelse","already_used":"Denne fargen er i bruk av en annen kategori","security":"Sikkerhet","images":"Bilder","auto_close_label":"Lukk emner automatisk etter:","auto_close_units":"timer","email_in":"Egendefinert inkommende e-postadresse:","email_in_allow_strangers":"Godta e-post fra anonyme brukere uten brukerkonto","email_in_disabled":"Posting av nye emner via e-post er deaktivert i nettstedsinstillingene. For å aktivere posting av nye emner via e-post,","email_in_disabled_click":"aktiver innstillingen \"e-post inn\".","allow_badges_label":"Tillat merker å bli tildelt i denne kategorien","edit_permissions":"Rediger tillatelser","add_permission":"Legg til tillatelser","this_year":"dette året","position":"posisjon","default_position":"Standard posisjon","position_disabled":"Kategorier vil bli vist i henhold til aktivitet. For å styre rekkefølgen av kategorier i listen","position_disabled_click":"kan du aktivere \"faste kategoriposisjoner\" i innstillinger.","parent":"Foreldrekategori","notifications":{"watching":{"title":"Følger"},"tracking":{"title":"Sporing"},"regular":{"title":"Normal","description":"Du vil bli varslet om noen nevner ditt @navn eller svarer deg."},"muted":{"title":"Dempet"}}},"flagging":{"title":"Takk for at du hjelper å holde forumet ryddig!","private_reminder":"flagg er private, \u003cb\u003ebare\u003c/b\u003e synlige for staben","action":"Rapporter innlegg","take_action":"Ta Handling","notify_action":"Melding","delete_spammer":"Slett spammer","delete_confirm":"Du er i ferd med å slette \u003cb\u003e%{posts}\u003c/b\u003e innlegg og \u003cb\u003e%{topics}\u003c/b\u003e emner av denne brukeren, slette brukerens konto, blokkere registrering fra brukerens IP-adresse \u003cb\u003e%{ip_address}\u003c/b\u003e, og legge brukerens e-postadresse \u003cb\u003e%{email}\u003c/b\u003e i en permanent svarteliste. Er du sikker på at denne brukeren virkelig er en spammer?","yes_delete_spammer":"Ja, slett spammer","ip_address_missing":"(N/A)","hidden_email_address":"(skjult)","submit_tooltip":"Rapporter privat","take_action_tooltip":"Oppnå rapporteringsterskel umiddelbart, i stedet for å vente på flere rapporteringer.","cant":"Beklager, du kan ikke rapportere dette innlegget nå.","formatted_name":{"off_topic":"Det er off-topic ","inappropriate":"Det er upassende","spam":"Det er reklame"},"custom_placeholder_notify_user":"Vær spesifikk, konstruktiv og snill.","custom_placeholder_notify_moderators":"La oss vite nøyaktig hva problemet er, og del relevante lenker og eksempler hvorvidt det er mulig.","custom_message":{"at_least":"skriv minst {{n}} bokstaver","more":"{{n}} igjen...","left":"{{n}} gjenstående"}},"flagging_topic":{"title":"Takk for at du hjelper med å vedlikeholde god skikk i samfundet vårt!","action":"Rapporter emne","notify_action":"Melding"},"topic_map":{"title":"Emneoppsummering","participants_title":"Hyppige Bidragsytere","links_title":"Populære Lenker","links_shown":"vis alle {{totalLinks}} linker...","clicks":{"one":"1 klikk","other":"%{count} klikk"}},"topic_statuses":{"warning":{"help":"Dette er en offisiell advarsel."},"bookmarked":{"help":"Du lagret dette emnet"},"locked":{"help":"dette emnet er låst; det aksepterer ikke lenger nye svar"},"archived":{"help":"dette emnet er arkivert; det er fryst og kan ikke bli aktivert"},"unpinned":{"title":"Løsgjort","help":"Dette emnet er ikke lenger fastsatt, det vil vises i vanlig rekkefølge"},"pinned_globally":{"title":"Globalt fastsatt"},"pinned":{"title":"Fastsatt","help":"Dette emnet er fastsatt for deg; det vil vises i toppen av sin kategori"},"invisible":{"help":"Dette emnet er ikke listet; det vil ikke vises i emnelister, og kan kun leses via en direktelenke"}},"posts":"Innlegg","posts_lowercase":"innlegg","posts_long":"{{number}} innlegg i dette emnet","original_post":"Originalt Innlegg","views":"Visninger","views_lowercase":{"one":"visninger","other":"visninger"},"replies":"Svar","views_long":"dette emnet har blit sett {{number}} ganger","activity":"Aktivitet","likes":"Liker","likes_lowercase":{"one":"like","other":"likes"},"likes_long":"det er {{number}} liker i dette emnet","users":"Deltakere","users_lowercase":{"one":"bruker","other":"brukere"},"category_title":"Kategori","history":"Historie","changed_by":"av {{author}}","raw_email":{"title":"Rå e-post","not_available":"Ikke tilgjengelig!"},"categories_list":"Kategoriliste","filters":{"with_topics":"%{filter} emner","with_category":"%{filter} %{category} emner","latest":{"title":"Siste","title_with_count":{"one":"Siste (1)","other":"Siste ({{count}})"},"help":"de sist oppdaterte emnene"},"hot":{"title":"Populære","help":"et utvalg av de mest populære emnene"},"read":{"title":"Lest","help":"emner du har lest, i den rekkefølgen du har lest dem"},"search":{"title":"Søk","help":"Søk i alle emner"},"categories":{"title":"Kategorier","title_in":"Kategori - {{categoryName}}","help":"alle emner sortert etter kategori"},"unread":{"title":"Ulest","title_with_count":{"one":"Ulest (1)","other":"Ulest ({{count}})"},"help":"emner du for øyeblikket følger eller sporer med uleste innlegg","lower_title_with_count":{"one":"1 ulest","other":"{{count}} uleste"}},"new":{"lower_title_with_count":{"one":"1 ny","other":"{{count}} nye"},"lower_title":"ny","title":"Ny","title_with_count":{"one":"Nye (1)","other":"Nye ({{count}})"},"help":"emner opprettet de siste dagene"},"posted":{"title":"Mine Innlegg","help":"emner du har postet i"},"bookmarks":{"title":"Bokmerker","help":"emner du har bokmerket"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"},"help":"siste emner i {{categoryName}}-kategorien"},"top":{"title":"Aktive","help":"de mest aktive emnene det siste året, den siste måneden, den siste uken eller i dag","all":{"title":"Totalt"},"yearly":{"title":"Årlig"},"quarterly":{"title":"Kvartalsvis"},"monthly":{"title":"Månedlig"},"weekly":{"title":"Ukentlig"},"daily":{"title":"Daglig"},"all_time":"Totalt","this_year":"År","this_quarter":"Kvartal","this_month":"Måned","this_week":"Uke","today":"I dag","other_periods":"se toppen"}},"browser_update":"Dessverre, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eDin nettleser er for gammel og fungerer ikke med dette nettstedet.\u003c/a\u003e. Vennligst \u003ca href=\"http://browsehappy.com\"\u003eoppgrader nettleseren din\u003c/a\u003e.","permission_types":{"full":"Opprett / Svar / Se","create_post":"Svar / Se","readonly":"Se"},"poll":{"voters":{"one":"stemmegiver","other":"stemmegivere"},"total_votes":{"one":"antall stemmer","other":"antall stemmer"},"average_rating":"Gjennomsnitt: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"between_min_and_max_options":"Du kan velge mellom \u003cstrong\u003e%{min}\u003c/strong\u003e og \u003cstrong\u003e%{max}\u003c/strong\u003e alternativer."}},"cast-votes":{"title":"Stem nå","label":"Stem!"},"show-results":{"title":"Vis resultat","label":"Vis resultat"},"hide-results":{"title":"Tilbake til dine stemmer","label":"Skjul resultater"},"open":{"title":"Åpne avstemming","label":"Åpne","confirm":"Er du sikker på at du vil åpne avstemmingen?"},"close":{"title":"Lukk avstemming","label":"Lukk","confirm":"Er du sikker på at du vil lukke avstemmingen?"},"error_while_toggling_status":"Det har oppstått en feil","error_while_casting_votes":"Noe gikk galt"},"type_to_filter":"skriv for å filtrere...","admin":{"title":"Discourse Admin","moderator":"Moderator","dashboard":{"title":"Dashbord","last_updated":"Dashboardet var sist oppdatert:","version":"Versjon","up_to_date":"Du har den seneste versjonen!","critical_available":"En kritisk oppdatering er tilgjengelig.","updates_available":"Oppdateringer er tilgjengelig.","please_upgrade":"Vennligst oppgrader!","no_check_performed":"En sjekk for oppdateringer har ikke blitt utført. Verifiser at sidekiq kjører.","stale_data":"Det har ikke vært sjekket for oppdateringer på en stund. Sjekk at sidekiq kjører.","version_check_pending":"Ser ut som om du oppgraderte nylig. Fantastisk!","installed_version":"Installert","latest_version":"Seneste","problems_found":"Det har oppstått noen problemer med din installasjon av Discourse:","last_checked":"Sist sjekket","refresh_problems":"Last inn siden på nytt","no_problems":"Ingen problemer ble funnet.","moderators":"Moderatorer:","admins":"Adminer:","blocked":"sperret:","suspended":"Bannlyst:","private_messages_short":"Meldinger","private_messages_title":"Meldinger","mobile_title":"Mobil","space_free":"{{size}} ledig","uploads":"opplastinger","backups":"sikkerhetskopier","traffic_short":"Trafikk","traffic":"Applikasjon webforespørsler","page_views":"API forespørsler","page_views_short":"API forespørsler","show_traffic_report":"Vis detaljert trafikkrapport","reports":{"today":"I dag","yesterday":"I går","last_7_days":"Siste 7 Dager","last_30_days":"Siste 30 Dager","all_time":"Gjennom Tidene","7_days_ago":"7 Dager Siden","30_days_ago":"30 Dager Siden","all":"Alle","view_table":"tabell","view_chart":"stolpediagram","refresh_report":"Refresh Rapport","start_date":"Startdato","end_date":"Sluttdato"}},"commits":{"latest_changes":"Siste endringer: Vennligst oppgrader ofte!","by":"av"},"flags":{"title":"Rapporteringer","old":"Gamle","active":"Aktive","agree":"Godta","agree_title":"Bekreft at denne rapporteringen er gyldig og korrekt","agree_flag_modal_title":"Godta og...","agree_flag_hide_post":"Godta (skjul innlegg + send PM)","agree_flag_hide_post_title":"Skjul dette innlegget og automatisk send brukeren en melding som oppfordrer vedkommende til å foreta endringer","agree_flag_restore_post":"Gi medhold (gjenopprett innlegg)","agree_flag_restore_post_title":"Gjenopprett dette innlegget","agree_flag":"Si deg enig med rapportering","agree_flag_title":"Si deg enig med rapportering og la innlegget stå urørt","defer_flag":"Utsett","defer_flag_title":"Fjern denne rapporteringen; den krever ingen handling på dette tidspunktet.","delete":"Slett","delete_title":"Fjern innlegget denne rapporteringen refererer til.","delete_post_defer_flag":"Slett innlegg og utsett rapportering","delete_post_defer_flag_title":"Slett innlegg; hvis det er første innlegg, slett emnet","delete_post_agree_flag":"Slett innlegg og si deg enig med rapportering","delete_post_agree_flag_title":"Slett innlegg; hvis det er første innlegg, slett emnet","delete_flag_modal_title":"Slett og...","delete_spammer":"Slett spammer","delete_spammer_title":"Fjern denne brukeren og alle innlegg og emner av brukeren.","disagree_flag_unhide_post":"Si deg uenig med rapportering (vis innlegg)","disagree_flag_unhide_post_title":"Fjern alle rapporteringer fra dette innlegget og gjør det synlig igjen","disagree_flag":"Si deg uenig","disagree_flag_title":"Benekt rapportering som ugyldig eller uriktig","clear_topic_flags":"Ferdig","clear_topic_flags_title":"Emnet har blitt undersøkt og problemer har blitt løst. Klikk Ferdig for å fjerne rapporteringene.","more":"(flere svar...)","dispositions":{"agreed":"enig","disagreed":"uenig","deferred":"utsatt"},"flagged_by":"Rapportert av","resolved_by":"Løst av","took_action":"Tok Handling","system":"System","error":"Noe gikk galt","reply_message":"Svar","no_results":"Det er ingen rapporteringer.","topic_flagged":"Dette emnet har blitt rapportert.","visit_topic":"Besøk emnet for å utføre handling","was_edited":"Innlegget ble redigert etter første rapportering","previous_flags_count":"Dette innlegget har allerede blitt rapportert {{count}} ganger.","summary":{"action_type_3":{"one":"irrelevant","other":"irrelevant x{{count}}"},"action_type_4":{"one":"upassende","other":"upassende x{{count}}"},"action_type_6":{"one":"tilpasset","other":"tilpasset x{{count}}"},"action_type_7":{"one":"tilpasset","other":"tilpasset x{{count}}"},"action_type_8":{"one":"nettsøppel","other":"nettsøppel x{{count}}"}}},"groups":{"primary":"Primærgruppe","no_primary":"(ingen primærgruppe)","title":"Grupper","edit":"Rediger Grupper","refresh":"Last inn på nytt","new":"Ny","selector_placeholder":"oppgi brukernavn","name_placeholder":"Gruppenavn, ingen mellomrom, samme regler som for brukernavn","about":"Rediger gruppemedlemskap og navn her.","group_members":"Gruppemedlemmer","delete":"Slett","delete_confirm":"Slette denne grupper?","delete_failed":"Unable to delete group. If this is an automatic group, it cannot be destroyed.","delete_member_confirm":"Fjern '%{username}' fra '%{group}' gruppen?","name":"Navn","add":"Legg til","add_members":"Legg til medlemmer","custom":"Egendefinert","automatic":"Automatisk","automatic_membership_email_domains":"Brukere som registererer seg med et epostdomene som matcher en i denne listen vil automatisk bli lagt til i denne gruppen.","automatic_membership_retroactive":"Benytt samme epostdomeneregel for å legge til eksisterende brukere","default_title":"Standardtittel for alle brukere i denne gruppen","primary_group":"Sett som primærgruppe automatisk"},"api":{"generate_master":"Generer Master API-nøkkel","none":"Det er ingen aktive API-nøkler akkurat nå.","user":"Bruker","title":"API","key":"Nøkkel","generate":"Generer API Nøkkel","regenerate":"Regenerer API Nøkkel","revoke":"Tilbakedra","confirm_regen":"Er du sikker på at du vil erstatte denne API-nøkkelen med en ny?","confirm_revoke":"Er du sikker på at du vil tilbakedra denne nøkkelen?","info_html":"Din API nøkkel vil tillate deg å lage og oppdatere emner ved å bruke JSON samteler.","all_users":"Alle brukere","note_html":"Hold denne nøkkelen \u003cstrong\u003ehemmelig\u003c/strong\u003e. Alle brukere som har den vil kunne opprette vilkårlige innlegg som en hvilken som helst bruker. "},"plugins":{"title":"Utvidelser","installed":"Installerte Utvidelser","name":"Navn","none_installed":"Du har ikke installert noen utvidelser.","version":"Versjon","enabled":"Aktivert?","is_enabled":"J","not_enabled":"N","change_settings":"Endre instillinger","change_settings_short":"Innstillinger","howto":"Hvordan installerer jeg utvidelser?"},"backups":{"title":"Sikkerhetskopieringer","menu":{"backups":"Sikkerhetskopieringer","logs":"Logger"},"none":"Ingen sikkerhetskopiering er tilgjengelig.","read_only":{"enable":{"title":"Aktiver skrivebeskyttet modus","label":"Aktiver skrivebeskyttet modus","confirm":"Er du sikker på at du vil aktivere skrivebeskyttet modus?"},"disable":{"title":"Deaktiver skrivebeskyttet modus","label":"Deaktiver skrivebeskyttet modus"}},"logs":{"none":"Ingen logger enda..."},"columns":{"filename":"Filnavn","size":"Størrelse"},"upload":{"label":"Last opp","title":"Last opp en sikkerhetskopi til denne instansen","uploading":"Laster opp...","success":"'{{filename}}' har blitt lastet opp.","error":"Det oppsto en feil ved opplastingen av '{{filename}}': {{message}}"},"operations":{"is_running":"En prosess pågår...","failed":" {{operation}} feilet. Venligst undersøk loggene.","cancel":{"label":"Avbryt","title":"Avbryt den nåværende handlingen","confirm":"Er du sikker på at du vil avbryte denne operasjonen?"},"backup":{"label":"Sikkerhetskopi","title":"Opprett en sikkerhetskopiering","confirm":"Vil du starte en ny sikkerhetskopiering?","without_uploads":"Ja (ikke inkluder filer)"},"download":{"label":"Last ned","title":"Last ned sikkerhetskopi"},"destroy":{"title":"Fjern sikkerhetskopi","confirm":"Er du sikker på at du vil slette denne sikkerhetskopien"},"restore":{"is_disabled":"Gjenoppretting er deaktivert i nettstedsinnstillingene.","label":"Gjenooprett","title":"Gjenopprett sikkerhetskopien","confirm":"Er du sikker på at du vil gjenopprette denne sikkerhetskopien?"},"rollback":{"label":"Gjenopprett","title":"Gjenopprett databasen til en tidligere fungerende tilstand","confirm":"Er du sikker på at du vil gjenopprette databasen til en tidligere fungerende tilstand?"}}},"export_csv":{"user_archive_confirm":"Er du sikker på at du vil laste ned innleggene dine?","success":"Eksportering iverksatt. Du vil bli varslet med en melding når prosessen er fullført.","failed":"Eksporteringen feilet. Venligst undersøk loggene.","rate_limit_error":"Innlegg kan lastes ned en gang om dagen, vennligst prøv igjen i morgen.","button_text":"Eksporter","button_title":{"user":"Eksporter full medlemsliste i CSV format.","staff_action":"Eksporter full handligslogg i CSV format.","screened_email":"Eksporter komplett liste over filtrerte epostadresser i CSV format.","screened_ip":"Eksporter komplett liste over filtrerte IP-addresser i CSV format.","screened_url":"Eksporter komplett liste over filtrerte URL'er i CSV format."}},"export_json":{"button_text":"Eksporter"},"invite":{"button_text":"Send invitasjoner","button_title":"Send invitasjoner"},"customize":{"title":"Tilpasse","long_title":"Nettstedstilpasninger","css":"CSS","header":"Header","top":"Topp","footer":"Footer","embedded_css":"Innebygd CSS","head_tag":{"text":"\u003c/head\u003e","title":"HTML som settes inn før \u003c/head\u003e taggen."},"body_tag":{"text":"\u003c/body\u003e","title":"HTML som settes inn før \u003c/body\u003e taggen."},"override_default":"Ikke inkluder standard stilark","enabled":"Aktivert?","preview":"forhåndsvisning","undo_preview":"avbryt forhåndsvisning","rescue_preview":"standard stil","explain_preview":"Se nettstedet med dette skreddersydde stilarket","explain_undo_preview":"Gå tilbake til nåværende aktivert tilpasset stilark","explain_rescue_preview":"Se nettstedet med standard stilark","save":"Lagre","new":"Ny","new_style":"Ny Stil","import":"Importer","import_title":"Velg en fil eller lim inn tekst","delete":"Slett","delete_confirm":"Slett denne tilpasningen?","about":"Endre CSS og HTML-headere på nettstedet. Legg til en tilpasning for å starte.","color":"Farge","opacity":"Opacity","copy":"Kopier","email_templates":{"subject":"Emne"},"css_html":{"title":"CSS/HTML","long_title":"CSS og HTML-tilpasninger"},"colors":{"title":"Farger","long_title":"Fargepanel","about":"Endre farger som brukes på nettstedet uten å skrive CSS. Legg til et skjema for å starte.","new_name":"Nytt fargetema","copy_name_prefix":"Kopi av","delete_confirm":"Slett dette fargetemaet?","undo":"angre","undo_title":"Fjern endringer av denne fargen siden sist den ble lagret.","revert":"gå tilbake","revert_title":"Nullstill denne fargen til standard fargeskjema for Discourse","primary":{"name":"primær","description":"Det meste av tekst, ikoner og kanter."},"secondary":{"name":"sekundær","description":"Primær bakgrunnsfarge og tekstfarge på noen knapper"},"tertiary":{"name":"tertiær","description":"Lenker, noen knapper, varsler og effektfarge"},"quaternary":{"name":"kvartær","description":"Navigasjonslenker."},"header_background":{"name":"bakgrunn i header","description":"Bakgrunnsfarge i nettstedets header"},"header_primary":{"name":"primær header","description":"Tekst og ikoner i nettstedets header"},"highlight":{"name":"utheving","description":"Bakgrunnsfarge på uthevede elementer på siden, som innlegg og emner."},"danger":{"name":"fare","description":"Uthevingsfarge for handlinger som sletting av innlegg og emner."},"success":{"name":"suksess","description":"Brukt til å indikere hvorvidt en handling var vellykket."},"love":{"name":"liker","description":"Fargen til Liker-knappen."},"wiki":{"name":"wiki","description":"Grunnfarge brukt for bakgrunnen i wiki-poster."}}},"email":{"title":"E-post","settings":"Instillinger","all":"Alle","sending_test":"Sender e-post for testing","error":"\u003cb\u003eERROR\u003c/b\u003e - %{server_error}","test_error":"Det oppsto et problem ved utsendelse av e-post for testing. Sjekk e-postinnstillinger nøye, sjekk at verten ikke blokkerer e-posttilkoblinger, og prøv igjen.","sent":"Sendt","skipped":"Hoppet over","sent_at":"Sendt","time":"Tid","user":"Bruker","email_type":"E-posttype","to_address":"Til adresse","test_email_address":"e-postadresse å teste","send_test":"Send e-post for testing","sent_test":"sendt!","delivery_method":"Leveringsmetode","preview_digest":"Forhåndsvis Oppsummering","refresh":"Refresh","format":"Format","html":"html","text":"tekst","last_seen_user":"Sist Sett Bruker:","reply_key":"Svar ID","skipped_reason":"Hopp over grunn","logs":{"none":"Ingen logger funnet","filters":{"title":"Filtrer","user_placeholder":"brukernavn","address_placeholder":"navn@eksempel.com","type_placeholder":"oppsummering, registrering...","reply_key_placeholder":"svarnøkkel","skipped_reason_placeholder":"grunn"}}},"logs":{"title":"Logger","action":"Handling","created_at":"Opprettet","last_match_at":"Siste treff","match_count":"Treff","ip_address":"IP","topic_id":"Emne ID","post_id":"Innlegg ID","category_id":"Kategori ID","delete":"Slett","edit":"Endre","save":"Lagre","screened_actions":{"block":"blokker","do_nothing":"ikke gjør noe"},"staff_actions":{"title":"Personalhandlinger","instructions":"Klikk på brukernavn og handlinger for å filtrere listen. Klikk på profilbilder for å gå til brukerens side.","clear_filters":"Vis alt","staff_user":"Personale","target_user":"Målbruker","subject":"Emne","when":"Når","context":"Kontekst","details":"Detaljer","previous_value":"Forrige","new_value":"Ny","diff":"Diff","show":"Vis","modal_title":"Detaljer","no_previous":"Det finnes ingen forrige verdi.","deleted":"Ingen ny verdi. Posten ble slettet.","actions":{"delete_user":"slett bruker","change_trust_level":"endre tillitsnivå","change_username":"endre brukernavn","change_site_setting":"endre nettstedsinnstilling","change_site_customization":"endre tilpasninger for nettstedet","delete_site_customization":"slett tilpasninger for nettstedet","suspend_user":"bannlys bruker","unsuspend_user":"gjeninnsett bruker","grant_badge":"tildel merke","revoke_badge":"tilbakedra merke","check_email":"sjekk e-post","delete_topic":"slett emne","delete_post":"slett innlegg","impersonate":"overta brukerkonto","anonymize_user":"anonymiser bruker","roll_up":"rull opp IP-blokker","delete_category":"slett kategori","create_category":"opprett kategori"}},"screened_emails":{"title":"Kontrollerte e-poster","description":"Når noen forsøker å lage en ny konto, vil de følgende e-postadressene bli sjekket, og registreringen vil bli blokkert, eller en annen handling vil bli utført.","email":"E-postadresse","actions":{"allow":"Tillat"}},"screened_urls":{"title":"Kontrollerte URLs","description":"URLer listet her ble brukt i innlegg av brukere som har blitt identifisert som spammere.","url":"URL","domain":"Domene"},"screened_ips":{"title":"Kontrollerte IPs","description":"IP-adresser som blir fulgt. Benytt \"Tillat\" for å hvitliste IP-adresser.","delete_confirm":"Er du sikker på at du vil fjerne regelen for %{ip_address}?","rolled_up_some_subnets":"Fullførte sammenslåingen av blokkerte IP-addresser til disse subnettene: %{subnets}.","rolled_up_no_subnet":"Det var ingenting å slå sammen.","actions":{"block":"Blokker","do_nothing":"Tillat","allow_admin":"Tillat Admin"},"form":{"label":"Ny:","ip_address":"IP-adresse","add":"Legg til","filter":"Søk"},"roll_up":{"text":"Slå sammen.","title":"Lager nye blokkeringsoppføringer for subnett hvis det er minst 'min_ban_entries_for_roll_up' oppføringer."}},"logster":{"title":"Feillogg"}},"impersonate":{"title":"Fremstå som","help":"Bruk dette verktøyet for å fremstå som en annen bruker for feilsøking. Du må logge ut når du er ferdig.","not_found":"Den brukeren kunne ikke bli funnet.","invalid":"Beklager, du kan ikke gi deg ut for å være den brukeren."},"users":{"title":"Brukere","create":"Legg til Admin Bruker","last_emailed":"Sist kontaktet","not_found":"Beklager, det brukernavner eksisterer ikke i systemet vårt.","id_not_found":"Beklager, denne brukerID eksisterer ikke i vårt system.","active":"Aktiv","show_emails":"Vis e-poster","nav":{"new":"Ny","active":"Aktiv","pending":"Ventende","staff":"Stab","suspended":"Bannlyst","blocked":"Blokkert","suspect":"Mistenkt"},"approved":"Godkjent?","approved_selected":{"one":"godkjenn bruker","other":"godkjenn brukere ({{count}})"},"reject_selected":{"one":"avvis bruker","other":"avvis brukere ({{count}})"},"titles":{"active":"Aktive Brukere","new":"Nye Brukere","pending":"Brukere som venter på evaluering","newuser":"Brukere med tillitsnivå 0 (Ny Bruker)","basic":"Brukere med tillitsnivå 1 (Juniormedlem)","staff":"Stab","admins":"Admins","moderators":"Moderatorer","blocked":"Blokkerte brukere","suspended":"Bannlyste brukere","suspect":"Mistenkte Brukere"},"reject_successful":{"one":"Avvist 1 bruker.","other":"Avviste %{count} brukere."},"reject_failures":{"one":"Kunne ikke avvise 1 bruker.","other":"Kunne ikke avvise %{count} brukere."},"not_verified":"Uverifisert","check_email":{"title":"Vis denne brukerens e-postadresse","text":"Vis"}},"user":{"suspend_failed":"Noe gikk galt ved å bannlyse denne brukeren {{error}}","unsuspend_failed":"Noe gikk galt ved å gjeninsette denne brukeren {{error}}","suspend_duration":"Hvor lenge vil du bannlyse denne brukeren? (dager)","suspend_duration_units":"(dager)","suspend_reason_label":"Hvorfor vil du bannlyse? Denne teksten \u003cb\u003evil være synlig for alle\u003c/b\u003e på denne brukerens profilside, og blir vist til brukeren om de skulle forsøke å logge inn. Fatt deg i korthet.","suspend_reason":"Begrunnelse","suspended_by":"Bannlyst av","delete_all_posts":"Slett alle innlegg","delete_all_posts_confirm":"Du skal til å slette %{posts} innlegg og %{topics} emner. Er du sikker?","suspend":"Bannlyst","unsuspend":"Gjeninnsett\"","suspended":"Bannlyst?","moderator":"Moderator?","admin":"Admin?","blocked":"Blokkert?","show_admin_profile":"Admin","edit_title":"Rediger Tittel","save_title":"Lagre Tittel","refresh_browsers":"Tving nettleser refresh","refresh_browsers_message":"Melding sendt til alle klienter!","show_public_profile":"Vis offentlig profil","impersonate":"Gi deg ut for å være en annen","ip_lookup":"IP Lookup","log_out":"Logg ut","logged_out":"Brukeren ble logget ut med alle enheter","revoke_admin":"Tilbakedra Admin","grant_admin":"Innvilg admin","revoke_moderation":"Tilbakedra Moderering","grant_moderation":"Innvilg moderering","unblock":"Opphev blokkering","block":"Blokker","reputation":"Rykte","permissions":"Tillatelser","activity":"Aktivitet","like_count":"Liker tildelt / mottatt","last_100_days":"de siste 100 dagene","private_topics_count":"Private emner","posts_read_count":"Innlegg lest","post_count":"Innlegg skrevet","topics_entered":"Emner vist","flags_given_count":"Rapporteringer tildelt","flags_received_count":"Rapporteringer mottatt","warnings_received_count":"Advarsler mottatt","flags_given_received_count":"Rapporteringer tildelt / mottatt","approve":"Godta","approved_by":"Godtatt Av","approve_success":"Brukeren er godkjent og e-post med aktiveringsinstruksjoner er sendt.","approve_bulk_success":"Suksess! Alle valgte brukere har blitt godkjent og varslet.","time_read":"Lesetid","anonymize":"Anonymiser Bruker","anonymize_confirm":"Ønsker du virkelig å anonymisere denne kontoen? Dette vil endre brukernavn og e-post samt tilbakestille kontoinnstillinger.","anonymize_yes":"Ja, anonymiser denne kontoen","anonymize_failed":"Det oppstod en feil ved anonymisering av denne kontoen.","delete":"Slett Bruker","delete_forbidden_because_staff":"Administratorer og moderatorer kan ikke slettes.","delete_posts_forbidden_because_staff":"Kan ikke slette alle innlegg av administratorer og moderatorer.","delete_forbidden":{"one":"Brukere kan ikke slettes om de har innlegg. Slett alle brukerens innlegg før bruker kan slettes. (Innlegg eldre enn %{count} dag kan ikke slettes.)","other":"Brukere kan ikke slettes om de har innlegg. Slett alle brukerens innlegg før bruker kan slettes. (Innlegg eldre enn %{count} dager kan ikke slettes.)"},"cant_delete_all_posts":{"one":"Kan ikke slette alle innlegg. Noen innlegg er eldre enn %{count} dag gammel. (Innstillingen delete_user_max_post_age.)","other":"Kan ikke slette alle innlegg. Noen innlegg er eldre enn %{count} dager gamle. (Innstillingen delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Kan ikke slette alle innlegg fordi brukeren har mer enn 1 innlegg. (delete_all_posts_max)","other":"Kan ikke slette alle innlegg fordi brukeren har mer enn %{count} innlegg. (delete_all_posts_max)"},"delete_confirm":"Er du HELT SIKKER på at du vil slette denne brukeren? Denne handlingen er permanent!","delete_and_block":"Slett og \u003cb\u003eblokker\u003c/b\u003e denne e-post- og IP-adressen","delete_dont_block":"Bare slett","deleted":"Brukeren ble slettet.","delete_failed":"Det oppstod en feil ved slettingen av den brukeren. Sørg for at alle av brukerens innlegg er slettet før du prøver å slette brukeren.","send_activation_email":"Send e-post for aktivering","activation_email_sent":"En e-post for aktivering har blitt sendt.","send_activation_email_failed":"Det oppstod et problem ved sending av ny e-post for aktivering. %{error}","activate":"Aktiver Konto","activate_failed":"Det oppstod et problem ved aktiveringen av den brukeren.","deactivate_account":"Deaktiver Konto","deactivate_failed":"Det oppstod et problem ved deaktiveringen av den brukeren.","unblock_failed":"Det oppstod et problem med å oppheve blokkeringen av brukeren.","block_failed":"Det oppstod et problem med blokkeringen av brukeren.","deactivate_explanation":"En deaktivert bruker må re-validere sin e-post.","suspended_explanation":"En bannlyst bruker kan ikke logge inn.","block_explanation":"En blokkert bruker kan ikke poste eller starte emner.","trust_level_change_failed":"Det oppsto et problem ved endring av brukerens tillitsnivå.","suspend_modal_title":"Bannlys bruker","trust_level_2_users":"Brukere med tillitsnivå 2","trust_level_3_requirements":"Krav til tillitsnivå 3","trust_level_locked_tip":"tillitsnivå er låst, systemet vil ikke forfremme eller degradere bruker","trust_level_unlocked_tip":"tillitsnivå er ulåst, systemet kan forfremme eller degradere bruker","lock_trust_level":"Lås tillitsnivå","unlock_trust_level":"Lås opp tillitsnivå","tl3_requirements":{"title":"Krav til tillitsnivå 3","table_title":"De siste 100 dagene:","value_heading":"Verdi","requirement_heading":"Krav","visits":"Besøk","days":"dager","topics_replied_to":"Emner besvart","topics_viewed":"Emner vist","topics_viewed_all_time":"Emner vist (totalt)","posts_read":"Innlegg lest","posts_read_all_time":"Innlegg lest (totalt)","flagged_posts":"Rapporterte innlegg","flagged_by_users":"Brukere som rapporterte","likes_given":"Likes tildelt","likes_received":"Likes mottatt","likes_received_days":"Likes Mottatt: unike dager","likes_received_users":"Likes Mottatt: unike brukere","qualifies":"Kvalifiserer til tillitsnivå 3.","does_not_qualify":"Kvalifiserer ikke til tillitsnivå 3.","will_be_promoted":"Vil snart forfremmes.","will_be_demoted":"Vil snart degraderes.","on_grace_period":"For tiden i prøvetid for forfremmelse, vil ikke degraderes","locked_will_not_be_promoted":"Tillitsnivå låst. Vil aldri bli forfremmet.","locked_will_not_be_demoted":"Tillitsnivå låst. Vil aldri bli degradert."},"sso":{"title":"Single Sign On","external_id":"Ekstern ID","external_username":"Brukernavn","external_name":"Navn","external_email":"E-post","external_avatar_url":"Profilbilde URL"}},"user_fields":{"title":"Brukerfelter","help":"Legg til felt som dine brukere kan fylle ut.","create":"Opprett brukerfelt","untitled":"Uten tittel","name":"Feltnavn","type":"Felttype","description":"Beskrivelse av felt","save":"Lagre","edit":"Endre","delete":"Slett","cancel":"Avbryt","delete_confirm":"Er du sikker på at du vil fjerne brukerfeltet?","options":"Alternativer","required":{"title":"Nødvendig ved registrering?","enabled":"nødvendig","disabled":"ikke obligatorisk"},"editable":{"title":"Kan det endres etter registrering?","enabled":"kan endres","disabled":"kan ikke endres"},"show_on_profile":{"title":"Vis på offentlig profil?","enabled":"vises på profil","disabled":"vises ikke på profil"},"field_types":{"text":"Tekstfelt","confirm":"Bekreftelse","dropdown":"Nedtrekk"}},"site_text":{"none":"Velg en innholdstype for å starte redigering.","title":"Tekstinnhold"},"site_settings":{"show_overriden":"Bare vis overstyrte","title":"Innstillinger","reset":"tilbakestill","none":"intet","no_results":"Ingen treff funnet.","clear_filter":"Tøm","add_url":"legg til URL","add_host":"legg til host","categories":{"all_results":"Alle","required":"Påkrevd","basic":"Grunnleggende oppsett","users":"Brukere","posting":"Posting","email":"E-post","files":"Filer","trust":"Tillitsnivå","security":"Sikkerhet","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Frekvensbegresninger","developer":"Utvikler","embedding":"Embedding","legal":"Juridisk","uncategorized":"Annet","backups":"Sikkerhetskopier","login":"Login","plugins":"Utvidelser"}},"badges":{"title":"Merker","new_badge":"Nytt merke","new":"Ny","name":"Navn","badge":"Merke","display_name":"Visningsnavn","description":"Beskrivelse","badge_type":"Merketype","badge_grouping":"Gruppe","badge_groupings":{"modal_title":"Merkegrupper"},"granted_by":"Tildelt av","granted_at":"Tildelt","reason_help":"(En lenke til et innlegg eller emne)","save":"Lagre","delete":"Slett","delete_confirm":"Er du sikker på at du vil slette dette merket?","revoke":"Tilbakedra","reason":"Grunn","expand":"Ekspander","revoke_confirm":"Er du sikker på at du vil tilbakedra dette merket?","edit_badges":"Rediger merker","grant_badge":"Tildel merke","granted_badges":"Tildelte merker","grant":"Tildel","no_user_badges":"%{name} har ikke blitt tildelt noen merker.","no_badges":"Det er ingen merker som kan bli tildelt.","none_selected":"Velg et merke for å komme i gang","allow_title":"Tillat merke å bli benyttet som en tittel","multiple_grant":"Kan bli tildelt flere ganger","listable":"Vis merket på den offentlige merkesiden","enabled":"Aktiver merke","icon":"Ikon","image":"Bilde","icon_help":"Bruk enten en Font Awesome class eller URL for et bilde","query":"Spørring for merke (SQL)","target_posts":"Spørring har innlegg som mål","auto_revoke":"Kjør tilbakedragningsspørring daglig","show_posts":"Vis innlegg som ga tildeling av merke på merkesiden","trigger":"Utløser","trigger_type":{"none":"Oppdater daglig","post_action":"Når en bruker gjør en handling på et innlegg","post_revision":"Når en bruker redigerer eller lager et nytt innlegg","trust_level_change":"Når bruker endrer tillitsnivå","user_change":"Når en bruker blir redigert eller registrert"},"preview":{"link_text":"Forhåndsvis tildelte merker","plan_text":"Forhåndsvis med plan for spørring","modal_title":"Forhåndsvisning av spørring for merke","sql_error_header":"Det oppsto en feil med spørringen.","error_help":"Se følgende lenker for hjelp til spørringer for merker.","bad_count_warning":{"header":"ADVARSEL!","text":"Det er manglende grant samples. Dette skjer når badge søket returnerer bruker-IDer eller post IDer som ikke eksisterer. Dette kan føre til uventede resultater senere - vennligst dobbeltsjekk søket ditt."},"sample":"Eksempel:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for innlegg i %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for innlegg i %{link} - \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e - \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Legg til en ny emoji som vil være tilgjengelig for alle. (PROTIP: Dra og slipp flere filer samtidig)","add":"Legg til ny Emoji","name":"Navn","image":"Bilde","delete_confirm":"Sikker på at du vil slette: %{name}: emoji?"},"permalink":{"title":"Permalenker","url":"URL","topic_id":"Emne ID","topic_title":"Emne","post_id":"Innlegg ID","post_title":"Innlegg","category_id":"Kategori ID","category_title":"Kategori","external_url":"Ekstern URL","delete_confirm":"Er du sikker du vil slette denne permalenken?","form":{"label":"Ny:","add":"Legg til","filter":"Søk (URL eller ekstern URL)"}}},"lightbox":{"download":"last ned"},"search_help":{"title":"Søke hjelp"},"keyboard_shortcuts_help":{"title":"Tastatursnarveier","jump_to":{"title":"Hopp til","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Hjem","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Siste","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nye","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Ules","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategorier","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Topp","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Bokmerker"},"navigation":{"title":"Navigasjon","jump":"\u003cb\u003e#\u003c/b\u003e Gå til innlegg #","back":"\u003cb\u003eu\u003c/b\u003e Tilbake","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Flytt markering \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e Åpne valgt emne","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Neste/Forrige"},"application":{"title":"Applikasjon","create":"\u003cb\u003ec\u003c/b\u003e Opprett nytt emne","notifications":"\u003cb\u003en\u003c/b\u003e Åpne varsler","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Åpne brukermenyen","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Vis oppdaterte emner","search":"\u003cb\u003e/\u003c/b\u003e Søk","help":"\u003cb\u003e?\u003c/b\u003e Åpne tastaturhjelp","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Avvis Nye/Innlegg","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Avvis Emner"},"actions":{"title":"Handlinger","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Bokmerk emne / Fjern bokmerke","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Pin/fjern pin fra emne","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Del emne","share_post":"\u003cb\u003es\u003c/b\u003e Del innlegg","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Svar med lenket emne","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Svar på emne","reply_post":"\u003cb\u003er\u003c/b\u003e Svar på innlegg","quote_post":"\u003cb\u003eq\u003c/b\u003e Siter innlegg","like":"\u003cb\u003el\u003c/b\u003e Lik innlegg","flag":"\u003cb\u003e!\u003c/b\u003e Rapporter innlegg","bookmark":"\u003cb\u003eb\u003c/b\u003e Bokmerk innlegg","edit":"\u003cb\u003ee\u003c/b\u003e Rediger innlegg","delete":"\u003cb\u003ed\u003c/b\u003e Slett innlegg","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Demp emne","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Vanlig (standard) emne","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Spor emne","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Følg emne"}},"badges":{"title":"Merker","allow_title":"kan bli brukt som tittel","multiple_grant":"kan bli belønnet mange ganger","badge_count":{"one":"1 Merke","other":"%{count} Merker"},"more_badges":{"one":"+1 Til","other":"+%{count} Til"},"granted":{"one":"1 tildelt","other":"%{count} tildelt"},"select_badge_for_title":"Velg et merke å bruke som din tittel","none":"\u003cingen\u003e","badge_grouping":{"getting_started":{"name":"Kom i gang"},"community":{"name":"Nettsamfunn"},"trust_level":{"name":"Tillitsnivå"},"other":{"name":"Annet"},"posting":{"name":"Posting"}},"badge":{"editor":{"name":"Redaktør","description":"Første redigering av innlegg"},"basic_user":{"name":"Basic","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eInnvilget\u003c/a\u003e alle essensielle forumfunksjoner"},"member":{"name":"Medlem","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eInnvilget\u003c/a\u003e invitasjonsmulighet"},"regular":{"name":"Aktivt Medlem","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eInnvilget\u003c/a\u003e omkategorisering, endring av navn, fulgte lenker og salong"},"leader":{"name":"Leder","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eInnvilget\u003c/a\u003e global redigering, fastsetting, lukking, arkivering, splitting og sammenslåing"},"welcome":{"name":"Velkommen","description":"Fått en liker"},"autobiographer":{"name":"Selvbiograf","description":"Fylte ut informasjon om \u003ca href=\"/my/preferences\"\u003ebrukerprofilen\u003c/a\u003e"},"anniversary":{"name":"Jubileum","description":"Aktivt medlem i over ett år, postet minst en gang"},"nice_post":{"name":"Fint innlegg","description":"Fått 10 liker for et innlegg. Dette merket kan bli tildelt flere ganger"},"good_post":{"name":"Bra innlegg","description":"Fått 25 liker for et innlegg. Dette merket kan bli tildelt flere ganger"},"great_post":{"name":"Flott Innlegg","description":"Fått 50 liker for et innlegg. Dette merket kan bli tildelt flere ganger"},"nice_topic":{"name":"Fint emne","description":"Fått 10 liker for et emne. Dette merket kan bli tildelt flere ganger"},"good_topic":{"name":"Godt emne","description":"Fått 25 liker for et emne. Dette merket kan bli tildelt flere ganger"},"great_topic":{"name":"Fantastisk emne","description":"Fått 50 liker for et emne. Dette merket kan bli tildelt flere ganger"},"nice_share":{"name":"Fin deling","description":"Delt et innlegg med 25 unike besøkende"},"good_share":{"name":"God deling","description":"Delt et innlegg med 300 unike besøkende"},"great_share":{"name":"Fantastisk Deling","description":"Delt et innlegg med 1000 unike besøkende"},"first_like":{"name":"Første liker","description":"Likt et innlegg"},"first_flag":{"name":"Første rapportering","description":"Rapportert et innlegg"},"promoter":{"name":"Forfrem","description":"Inviterte en bruker"},"campaigner":{"name":"Campaigner","description":"Inviterte 3 medlemmer (tillitsnivå 1)"},"champion":{"name":"Mester","description":"Inviterte 5 medlemmer (tillitsnivå 2)"},"first_share":{"name":"Første deling","description":"Delt et innlegg"},"first_link":{"name":"Første lenke","description":"Link til et eksisterende emne"},"first_quote":{"name":"Første sitat","description":"Sitert en bruker"},"read_guidelines":{"name":"Leste retningslinjene","description":"Lest \u003ca href=\"/guidelines\"\u003eforumets retningslinjer\u003c/a\u003e"},"reader":{"name":"Leser","description":"Leste hvert innlegg i et emne med mer enn 100 innlegg"}}}}},"en":{"js":{"action_codes":{"split_topic":"split this topic %{when}","pinned_globally":{"disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"switch_from_anon":"Exit Anonymous","groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"trust_levels":{"title":"Trust level automatically granted to members when they're added:"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"}},"user":{"expand_profile":"Expand","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)"},"muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_avatar":{"cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","login":{"to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","whisper":"this post is a private whisper for moderators","controls":{"change_owner":"Change Ownership"}},"category":{"special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"title":"Email Templates","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"staff_actions":{"actions":{"change_category_settings":"change category settings"}},"screened_ips":{"roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?"}},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge":{"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'nb_NO';
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
// language : norwegian bokmål (nb)
// author : Espen Hovlandsdal : https://github.com/rexxars

moment.lang('nb_NO', {
    months : "januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember".split("_"),
    monthsShort : "jan_feb_mar_apr_mai_jun_jul_aug_sep_okt_nov_des".split("_"),
    weekdays : "søndag_mandag_tirsdag_onsdag_torsdag_fredag_lørdag".split("_"),
    weekdaysShort : "søn_man_tir_ons_tor_fre_lør".split("_"),
    weekdaysMin : "sø_ma_ti_on_to_fr_lø".split("_"),
    longDateFormat : {
        LT : "HH:mm",
        L : "YYYY-MM-DD",
        LL : "D MMMM YYYY",
        LLL : "D MMMM YYYY LT",
        LLLL : "dddd D MMMM YYYY LT"
    },
    calendar : {
        sameDay: '[I dag klokken] LT',
        nextDay: '[I morgen klokken] LT',
        nextWeek: 'dddd [klokken] LT',
        lastDay: '[I går klokken] LT',
        lastWeek: '[Forrige] dddd [klokken] LT',
        sameElse: 'L'
    },
    relativeTime : {
        future : "om %s",
        past : "for %s siden",
        s : "noen sekunder",
        m : "ett minutt",
        mm : "%d minutter",
        h : "en time",
        hh : "%d timer",
        d : "en dag",
        dd : "%d dager",
        M : "en måned",
        MM : "%d måneder",
        y : "ett år",
        yy : "%d år"
    },
    ordinal : '%d.',
    week : {
        dow : 1, // Monday is the first day of the week.
        doy : 4  // The week that contains Jan 4th is the first week of the year.
    }
});

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
