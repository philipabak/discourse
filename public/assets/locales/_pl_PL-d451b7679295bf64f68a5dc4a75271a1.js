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
    })({});I18n.translations = {"pl_PL":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"bajt","few":"bajty","other":"bajtów"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"H:mm","long_no_year":"D MMM H:mm","long_no_year_no_time":"D MMM","full_no_year_no_time":"MMMM Do","long_with_year":"D MMM YYYY H:mm","long_with_year_no_time":"D MMM YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"D MMM 'YY LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM 'YY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","few":"\u003c %{count}s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","few":"%{count}s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","few":"\u003c %{count}m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","few":"%{count}m","other":"%{count}m"},"about_x_hours":{"one":"1h","few":"%{count}h","other":"%{count}h"},"x_days":{"one":"1d","few":"%{count}d","other":"%{count}d"},"about_x_years":{"one":"1r","few":"%{count}r","other":"%{count}r"},"over_x_years":{"one":"\u003e 1r","few":"\u003e %{count}r","other":"\u003e %{count}r"},"almost_x_years":{"one":"1r","few":"%{count}r","other":"%{count}r"},"date_month":"D MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuta","few":"%{count} minuty","other":"%{count} minut"},"x_hours":{"one":"1 godzina","few":"%{count} godziny","other":"%{count} godzin"},"x_days":{"one":"1 dzień","few":"%{count} dni","other":"%{count} dni"},"date_year":"D MMM 'YY"},"medium_with_ago":{"x_minutes":{"one":"minutę temu","few":"%{count} minuty temu","other":"%{count} minut temu"},"x_hours":{"one":"godzinę temu","few":"%{count} godziny temu","other":"%{count} godzin temu"},"x_days":{"one":"wczoraj","few":"%{count} dni temu","other":"%{count} dni temu"}},"later":{"x_days":{"one":"1 dzień później","few":"%{count} dni później","other":"%{count} dni później"},"x_months":{"one":"1 miesiąc później","few":"%{count} miesiące później","other":"%{count} miesięcy później"},"x_years":{"one":"1 rok później","few":"%{count} lata później","other":"%{count} lat później"}}},"share":{"topic":"udostępnij odnośnik do tego tematu","post":"wpis #%{postNumber}","close":"zamknij","twitter":"udostępnij ten odnośnik na Twitterze","facebook":"udostępnij ten odnośnik na Facebooku","google+":"udostępnij ten odnośnik na Google+","email":"wyślij ten odnośnik przez email"},"action_codes":{"split_topic":"podziel ten temat %{when}","autoclosed":{"enabled":"zamknięcie %{when}","disabled":"otworzenie %{when}"},"closed":{"enabled":"zamknięcie %{when}","disabled":"otworzenie %{when}"},"archived":{"enabled":"archiwizacja %{when}","disabled":"dearchiwizacja %{when}"},"pinned":{"enabled":"przypięcie %{when}","disabled":"odpięcie %{when}"},"pinned_globally":{"enabled":"globalne przypięcie %{when}","disabled":"globalne odpięcie %{when}"},"visible":{"enabled":"wylistowanie %{when}","disabled":"odlistowanie %{when}"}},"topic_admin_menu":"akcje administratora","emails_are_disabled":"Wysyłanie e-maili zostało globalnie wyłączone przez administrację. Powiadomienia e-mail nie będą dostarczane.","edit":"edytuj tytuł i kategorię tego tematu","not_implemented":"Bardzo nam przykro, ale ta funkcja nie została jeszcze zaimplementowana.","no_value":"Nie","yes_value":"Tak","generic_error":"Przepraszamy, wystąpił błąd.","generic_error_with_reason":"Wystąpił błąd: %{error}","sign_up":"Rejestracja","log_in":"Logowanie","age":"Wiek","joined":"Dołączył","admin_title":"Administracja","flags_title":"Flagi","show_more":"pokaż więcej","show_help":"pomoc","links":"Odnośniki","links_lowercase":{"one":"link","few":"linki","other":"linków"},"faq":"FAQ","guidelines":"Przewodnik","privacy_policy":"Polityka prywatności","privacy":"Prywatność","terms_of_service":"Warunki użytkowania serwisu","mobile_view":"Wersja mobilna","desktop_view":"Wersja komputerowa","you":"Ty","or":"lub","now":"teraz","read_more":"więcej","more":"Więcej","less":"Mniej","never":"nigdy","daily":"dziennie","weekly":"tygodniowo","every_two_weeks":"co dwa tygodnie","every_three_days":"co trzy dni","max_of_count":"max z {{count}}","alternation":"lub","character_count":{"one":"1 znak","few":"{{count}} znaki","other":"{{count}} znaków"},"suggested_topics":{"title":"Sugerowane tematy"},"about":{"simple_title":"O stronie","title":"O %{title}","stats":"Statystyki strony","our_admins":"Administratorzy","our_moderators":"Moderatoratorzy","stat":{"all_time":"Ogółem","last_7_days":"Ostatnich 7 dni","last_30_days":"Ostatnie 30 dni"},"like_count":"Polubienia","topic_count":"Tematy","post_count":"Wpisy","user_count":"Nowi użytkownicy","active_user_count":"Aktywni użytkownicy","contact":"Kontakt","contact_info":"W sprawach wymagających szybkiej reakcji lub związanych z poprawnym funkcjonowaniem serwisu, prosimy o kontakt: %{contact_info}."},"bookmarked":{"title":"Zakładka","clear_bookmarks":"Usuń z zakładek","help":{"bookmark":"Kliknij, aby dodać pierwszy wpis tematu do zakładek","unbookmark":"Kliknij, aby usunąć wszystkie zakładki z tego tematu"}},"bookmarks":{"not_logged_in":"przykro nam, ale należy się zalogować, aby dodawać zakładki","created":"zakładka dodana","not_bookmarked":"wpis przeczytany: kliknij, aby dodać zakładkę","last_read":"to ostatni przeczytany przez ciebie wpis: kliknij, aby dodać zakładkę","remove":"Usuń zakładkę","confirm_clear":"Czy na pewno chcesz usunąć wszystkie zakładki ustawione w tym temacie?"},"topic_count_latest":{"one":"{{count}} nowy lub zaktualizowany temat","few":"{{count}} nowe lub zaktualizowane tematy","other":"{{count}} nowych lub zaktualizowanych tematów"},"topic_count_unread":{"one":"{{count}} nieprzeczytany temat.","few":"{{count}} nieprzeczytane tematy.","other":"{{count}} nieprzeczytanych tematów."},"topic_count_new":{"one":"{{count}} nowy temat.","few":"{{count}} nowe tematy.","other":"{{count}} nowych tematów."},"click_to_show":"Kliknij aby zobaczyć.","preview":"podgląd","cancel":"anuluj","save":"Zapisz zmiany","saving":"Zapisuję…","saved":"Zapisano!","upload":"Dodaj","uploading":"Wysyłam…","uploading_filename":"Wysyłanie {{filename}}...","uploaded":"Wgrano!","enable":"Włącz","disable":"Wyłącz","undo":"Cofnij","revert":"Przywróć","failed":"Niepowodzenie","switch_to_anon":"Tryb anonimowy","switch_from_anon":"Zakończ tryb anonimowy","banner":{"close":"Zamknij ten baner.","edit":"Edytuj ten baner \u003e\u003e"},"choose_topic":{"none_found":"Nie znaleziono tematów.","title":{"search":"Szukaj tematu po nazwie, URL-u albo ID:","placeholder":"tutaj wpisz tytuł tematu"}},"queue":{"topic":"Temat:","approve":"Zatwierdź","reject":"Odrzuć","delete_user":"Usuń użytkownika","title":"Wymaga zatwierdzenia","none":"Brak wpisów wymagających uwagi.","edit":"Edytuj","cancel":"Anuluj","view_pending":"wyświetl oczekujące wpisy","has_pending_posts":{"one":"Ten temat posiada \u003cb\u003e1\u003c/b\u003e wpis oczekujący na akceptację","few":"Ten temat posiada \u003cb\u003e{{count}}\u003c/b\u003e wpisy oczekujące na akceptację","other":"Ten temat posiada \u003cb\u003e{{count}}\u003c/b\u003e wpisów oczekujących na akceptację"},"confirm":"Zapisz zmiany","delete_prompt":"Czy na pewno chcesz usunąć \u003cb\u003e%{username}\u003c/b\u003e? Zostaną usunięte wszystkie wpisy utworzone z tego konta oraz zostanie zablokowany powiązany e-mail oraz adres IP.","approval":{"title":"Wpis wymaga zatwierdzenia","description":"Twój nowy wpis został umieszczony w kolejce i pojawi się po zatwierdzeniu przez moderatora. Prosimy o cierpliwość.","pending_posts":{"one":"Posiadasz \u003cstrong\u003e1\u003c/strong\u003e oczekujący wpis.","few":"Posiadasz \u003cstrong\u003e{{count}}\u003c/strong\u003e oczekujące wpisy.","other":"Posiadasz \u003cstrong\u003e{{count}}\u003c/strong\u003e oczekujących wpisów."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e tworzy \u003ca href='{{topicUrl}}'\u003etemat\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eDodajesz\u003c/a\u003e \u003ca href='{{topicUrl}}'\u003etemat\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e odpowiada na \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eOdpowiadasz\u003c/a\u003e na \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e odpisuje na \u003ca href='{{topicUrl}}'\u003etemat\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eOdpowiadasz\u003c/a\u003e w \u003ca href='{{topicUrl}}'\u003etemacie\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e wspomina o \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e wspomniał o \u003ca href='{{user2Url}}'\u003etobie\u003c/a\u003e","you_mentioned_user":"\u003ca href=\"{{user1Url}}\"\u003eWspomniałeś/aś\u003c/a\u003e o użytkowniku \u003ca href=\"{{user2Url}}\"\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Wysłane przez \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Dodany przez \u003ca href='{{userUrl}}'\u003eciebie\u003c/a\u003e","sent_by_user":"Wysłano przez \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Wysłano przez \u003ca href='{{userUrl}}'\u003eCiebie\u003c/a\u003e"},"directory":{"filter_name":"sortuj po nazwie użytkownika","title":"Użytkownicy","likes_given":"Oddane","likes_received":"Otrzymane","topics_entered":"Odwiedzone","topics_entered_long":"Odwiedzone tematy","time_read":"Czas","topic_count":"Tematy","topic_count_long":"Utworzone tematy","post_count":"Odpowiedzi","post_count_long":"Wysłane odpowiedzi","no_results":"Nie znaleziono wyników.","days_visited":"Odwiedziny","days_visited_long":"Dni Odwiedzin","posts_read":"Przeczytane","posts_read_long":"Przeczytane wpisy","total_rows":{"one":"1 użytkownik","few":"%{count} użytkownicy","other":"%{count} użytkowników"}},"groups":{"add":"Dodaj","selector_placeholder":"Dodaj członków","owner":"właściciel","visible":"Grupa jest widoczna dla wszystkich użytkowników","title":{"one":"grupa","few":"grupy","other":"grupy"},"members":"Członkowie","posts":"Wpisów","alias_levels":{"title":"Kto może użyć aliasu tej grupy?","nobody":"Nikt","only_admins":"Tylko administratorzy","mods_and_admins":"Tylko moderatorzy i administratorzy","members_mods_and_admins":"Tylko członkowie grupy, moderatorzy i administratorzy","everyone":"Wszyscy"},"trust_levels":{"title":"Domyślny poziom zaufania przyznawany nowych użytkownikom:","none":"Brak"}},"user_action_groups":{"1":"Przyznane polubienia","2":"Otrzymane polubienia","3":"Zakładki","4":"Tematy","5":"Odpowiedzi","6":"Odpowiedzi","7":"Wzmianki","9":"Cytaty","10":"Oznaczone","11":"Edycje","12":"Wysłane","13":"Skrzynka odbiorcza","14":"Oczekujące"},"categories":{"all":"wszystkie kategorie","all_subcategories":"wszystkie","no_subcategory":"żadne","category":"Kategoria","reorder":{"title":"Zmień kolejność kategorii","title_long":"Zmień kolejność listy kategorii","fix_order":"Popraw pozycje","fix_order_tooltip":"Nie wszystkie kategorie posiadają unikalny numer porządkowy, co może wygenerować nieoczekiwane wyniki.","save":"Zapisz kolejność","apply_all":"Zastosuj","position":"Pozycja"},"posts":"Wpisy","topics":"Tematy","latest":"Aktualne","latest_by":"najnowszy wpis: ","toggle_ordering":"przełącz kolejność kontroli","subcategories":"Podkategorie","topic_stats":"Liczba nowych tematów.","topic_stat_sentence":{"one":"ostatni %{unit}: %{count} nowy temat.","few":"ostatni %{unit}: %{count} nowe tematy.","other":"ostatni %{unit}: %{count} nowych tematów."},"post_stats":"Liczba nowych wpisów.","post_stat_sentence":{"one":"ostatni %{unit}: %{count} nowy wpis.","few":"ostatni %{unit}: %{count} nowe wpisy.","other":"ostatni %{unit}: %{count} nowych wpisów."}},"ip_lookup":{"title":"Wyszukiwanie adresu IP","hostname":"Nazwa hosta","location":"Lokalizacja","location_not_found":"(nieznane)","organisation":"Organizacja","phone":"Numer telefonu","other_accounts":"Inne konta z tym adresem IP:","delete_other_accounts":"Usuń %{count}","username":"nazwa użytkownika","trust_level":"TL","read_time":"czas czytania:","topics_entered":"wprowadzone tematy:","post_count":"# wpisów","confirm_delete_other_accounts":"Czy na pewno chcesz usunąć wybrane konta?"},"user_fields":{"none":"(wybierz opcję)"},"user":{"said":"{{username}}:","profile":"Profil","mute":"Wycisz","edit":"Edytuj ustawienia","download_archive":"Pobierz moje wpisy","new_private_message":"Nowa wiadomość","private_message":"Wiadomość","private_messages":"Wiadomości","activity_stream":"Aktywność","preferences":"Ustawienia","expand_profile":"Rozwiń","bookmarks":"Zakładki","bio":"O mnie","invited_by":"Zaproszono przez","trust_level":"Poziom zaufania","notifications":"Powiadomienia","desktop_notifications":{"label":"Powiadomienia systemowe","not_supported":"Powiadomienia nie są wspierane przez tę przeglądarkę. Przepraszamy.","perm_default":"Włącz powiadomienia","perm_denied_btn":"Brak uprawnień","perm_denied_expl":"Wyświetlanie powiadomień jest zablokowane. Użyj ustawień swojej przeglądarki, aby odblokować powiadomienia dla tej domeny.","disable":"Wyłącz powiadomienia","currently_enabled":"(aktualnie włączone)","enable":"Włącz powiadomienia","currently_disabled":"(aktualnie wyłączone)","each_browser_note":"Uwaga: to ustawienie musisz zmienić w każdej przeglądarce której używasz."},"dismiss_notifications":"Oznacz jako przeczytane","dismiss_notifications_tooltip":"Oznacz wszystkie powiadomienia jako przeczytane","disable_jump_reply":"Po odpowiedzi nie przechodź do nowego wpisu","dynamic_favicon":"Pokazuj licznik powiadomień na karcie jako dynamiczny favicon","edit_history_public":"Pozwól innym oglądać historię edycji moich wpisów","external_links_in_new_tab":"Otwieraj wszystkie zewnętrzne odnośniki w nowej karcie","enable_quoting":"Włącz cytowanie zaznaczonego tekstu","change":"zmień","moderator":"{{user}} jest moderatorem","admin":"{{user}} jest adminem","moderator_tooltip":"Ten użytkownik jest moderatorem","admin_tooltip":"Ten użytkownik jest administratorem","blocked_tooltip":"Ten użytkownik jest zablokowany","suspended_notice":"ten użytkownik jest zawieszony do {{date}}.","suspended_reason":"Powód: ","github_profile":"Github","mailing_list_mode":"Wysyłaj e-mail z każdym nowym wpisem (o ile nie wyciszysz kategorii lub tematu).","watched_categories":"Obserwowane","watched_categories_instructions":"Będziesz automatycznie śledzić wszystkie nowe tematy w tych kategoriach. Będziesz otrzymywać powiadomienie o każdym nowym wpisie i temacie, a liczba nieprzeczytanych i nowych wpisów będzie wyświetlana obok tytułów na liście tematów. ","tracked_categories":"Śledzone","tracked_categories_instructions":"Będziesz automatycznie śledzić wszystkie nowe tematy w tych kategoriach. Licznik nowych wpisów pojawi się obok tytułu na liście tematów.","muted_categories":"Wyciszone","muted_categories_instructions":"Nie będziesz powiadamiany o nowych tematach w tych kategoriach. Nie pojawią się na liście nieprzeczytanych.","delete_account":"Usuń moje konto","delete_account_confirm":"Czy na pewno chcesz usunąć swoje konto? To nieodwracalne!","deleted_yourself":"Twoje konto zostało usunięte.","delete_yourself_not_allowed":"Nie możesz usunąć swojego konta w tej chwili. Skontaktuj się z administratorem, by usunął Twoje konto za Ciebie.","unread_message_count":"Wiadomości","admin_delete":"Usuń","users":"Użytkownicy","muted_users":"Uciszeni","muted_users_instructions":"Wstrzymaj powiadomienia od tych użytkowników.","muted_topics_link":"Pokaż wyciszone tematy","automatically_unpin_topics":"Automatycznie odpinaj tematy po przeczytaniu ostatniego wpisu.","staff_counters":{"flags_given":"uczynnych oflagowań","flagged_posts":"oflagowane wpisy","deleted_posts":"usunięte wpisy","suspensions":"zawieszone","warnings_received":"otrzymanych ostrzeżeń"},"messages":{"all":"Wszystkie","mine":"Moje","unread":"Nieprzeczytane"},"change_password":{"success":"(email wysłany)","in_progress":"(email wysyłany)","error":"(błąd)","action":"Wyślij wiadomość email resetującą hasło","set_password":"Ustaw hasło"},"change_about":{"title":"Zmień O mnie","error":"Wystąpił błąd podczas zmiany tej wartości."},"change_username":{"title":"Zmień nazwę użytkownika","confirm":"Jeżeli zmienisz swoją nazwę użytkownika, wszystkie stare cytaty twoich wpisów oraz wzmianki przez @nazwę przestaną działać. Czy na pewno tego chcesz?","taken":"Przykro nam, ale ta nazwa jest zajęta.","error":"Podczas zmiany twojej nazwy użytkownika wystąpił błąd.","invalid":"Ta nazwa jest niepoprawna. Powinna zawierać jedynie liczby i litery."},"change_email":{"title":"Zmień adres email","taken":"Przykro nam, ale ten adres email nie jest dostępny.","error":"Wystąpił błąd podczas próby zmiany twojego adresu email. Być może ten email jest już zarejestrowany?","success":"Wysłaliśmy wiadomość do potwierdzenia na podany adres email."},"change_avatar":{"title":"Zmień swój awatar","gravatar":"bazujący na \u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e","gravatar_title":"Zmień swój awatar na stronie serwisu Gravatar","refresh_gravatar_title":"Zaktualizuj swój Gravatar","letter_based":"Awatar przyznany przez system","uploaded_avatar":"Zwyczajny obrazek","uploaded_avatar_empty":"Dodaj zwyczajny obrazek","upload_title":"Wyślij swoją grafikę","upload_picture":"Wyślij grafikę","image_is_not_a_square":"Uwaga: grafika została przycięta ponieważ jej wysokość i szerokość nie były równe. ","cache_notice":"Twój awatar został pomyślnie zmieniony, ale z uwagi na cache przeglądarki nowa wersja może pojawić się dopiero za jakiś czas."},"change_profile_background":{"title":"Tło profilu","instructions":"Tła w profilach są wycentrowane i posiadają domyślną szerokość 850px."},"change_card_background":{"title":"Tło karty użytkownika","instructions":"Tło karty użytkownika est wycentrowane i posiada domyślną szerokość 590px."},"email":{"title":"Email","instructions":"Nie będzie publicznie widoczny","ok":"Otrzymasz potwierdzenie emailem","invalid":"Podaj poprawny adres email","authenticated":"Twój email został potwierdzony przez {{provider}}","frequency_immediately":"Wyślemy powiadomienie jeśli wskazana rzecz nie została jeszcze przez Ciebie przeczytana.","frequency":{"one":"Otrzymasz e-mail tylko jeśli nie widzieliśmy Cię w ciągu ostatniej minuty.","few":"Otrzymasz e-mail tylko jeśli nie widzieliśmy Cię w ciągu ostatnich {{count}} minut.","other":"Otrzymasz e-mail tylko jeśli nie widzieliśmy Cię w ciągu ostatnich {{count}} minut."}},"name":{"title":"Pełna nazwa","instructions":"Twoja pełna nazwa (opcjonalna)","instructions_required":"Twoja pełna nazwa","too_short":"Twoja nazwa jest zbyt krótka","ok":"Twoja nazwa jest ok"},"username":{"title":"Nazwa konta","instructions":"Unikalna, krótka i bez spacji","short_instructions":"Inni mogą o tobie wspomnieć pisząc @{{username}}","available":"Nazwa użytkownika jest dostępna","global_match":"Email zgadza się z zarejestrowaną nazwą użytkownika","global_mismatch":"Zajęta. Może spróbuj {{suggestion}}?","not_available":"Niedostępna. Może spróbuj {{suggestion}}?","too_short":"Nazwa użytkownika jest zbyt krótka","too_long":"Nazwa użytkownika jest zbyt długa","checking":"Sprawdzanie, czy nazwa jest dostępna…","enter_email":"Nazwa użytkownika znaleziona – wpisz przypisany adres email","prefilled":"Email zgadza się z zarejestrowaną nazwą użytkownika"},"locale":{"title":"Język interfejsu","instructions":"Język interfejsu użytkownika. Zmieni się, gdy odświeżysz stronę.","default":"(domyślny)"},"password_confirmation":{"title":"Powtórz hasło"},"last_posted":"Ostatni wpis","last_emailed":"Ostatnio otrzymał email","last_seen":"Ostatnio widziano","created":"Dołączył","log_out":"Wyloguj","location":"Lokalizacja","card_badge":{"title":"Odznaka karty użytkownika"},"website":"Strona internetowa","email_settings":"Email","email_digests":{"title":"Gdy nie odwiedzam strony, wysyłaj e-mail z podsumowaniem aktywności:","daily":"codziennie","every_three_days":"co trzy dni","weekly":"co tydzień","every_two_weeks":"co dwa tygodnie"},"email_direct":"Wysyłaj e-mail gdy ktoś mnie cytuje, odpowiada na mój wpis, wywołuje moją @nazwę lub zaprasza mnie do tematu.","email_private_messages":"Wyślij e-mail, gdy ktoś napisze mi prywatną wiadomość","email_always":"Wysyłaj powiadomienia email nawet, gdy przejawiam aktywność w serwisie","other_settings":"Inne","categories_settings":"Kategorie","new_topic_duration":{"label":"Uznaj, że temat jest nowy, jeśli","not_viewed":"niewidziane ","last_here":"dodane od ostatniej wizyty","after_1_day":"utworzone w ciągu ostatniego dnia","after_2_days":"utworzone w ciągu ostatnich 2 dni","after_1_week":"utworzone w ostatnim tygodniu","after_2_weeks":"utworzone w ostatnich 2 tygodniach"},"auto_track_topics":"Automatycznie śledź tematy które odwiedzę","auto_track_options":{"never":"nigdy","immediately":"natychmiast","after_30_seconds":"po 30 sekundach","after_1_minute":"po 1 minucie","after_2_minutes":"po 2 minutach","after_3_minutes":"po 3 minutach","after_4_minutes":"po 4 minutach","after_5_minutes":"po 5 minutach","after_10_minutes":"po 10 minutach"},"invited":{"search":"wpisz aby szukać zaproszeń…","title":"Zaproszenia","user":"Zaproszony(-a) użytkownik(-czka)","sent":"Wysłane","none":"Nie ma żadnych zaproszeń do wyświetlenia.","truncated":{"one":"Wyświetlanie pierwszego zaproszenia.","few":"Wyświetlanie {{count}} pierwszych zaproszeń.","other":"Wyświetlanie {{count}} pierwszych zaproszeń."},"redeemed":"Cofnięte zaproszenia","redeemed_tab":"Przyjęte","redeemed_tab_with_count":"Zrealizowane ({{count}})","redeemed_at":"Przyjęte","pending":"Oczekujące zaproszenia","pending_tab":"Oczekujący","pending_tab_with_count":"Oczekujące ({{count}})","topics_entered":"Obejrzane tematy","posts_read_count":"Przeczytane wpisy","expired":"To zaproszenie wygasło.","rescind":"Usuń","rescinded":"Zaproszenie usunięte","reinvite":"Ponów zaproszenie","reinvited":"Ponowne wysłanie zaproszenia","time_read":"Czas odczytu","days_visited":"Dni odwiedzin","account_age_days":"Wiek konta w dniach","create":"Wyślij zaproszenie","generate_link":"Skopiuj link z zaproszeniem","generated_link_message":"\u003cp\u003eLink z zaproszeniem został wygenerowany pomyślnie!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eLink zaproszenia jest ważny jedynie dla tego adresu e-mail: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Jeszcze nikogo nie zaproszono. Możesz wysłać pojedyncze zaproszenie lub \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003ezaprosić wiele osób na raz wysyłając odpowiedni plik\u003c/a\u003e.","text":"Zaproszenia hurtowe z pliku","uploading":"Wysyłanie…","success":"Plik został przesłany pomyślnie: otrzymasz prywatną wiadomość, gdy proces zostanie zakończony.","error":"Podczas przesyłania wystąpił błąd '{{filename}}': {{message}}"}},"password":{"title":"Hasło","too_short":"Hasło jest za krótkie.","common":"To hasło jest zbyt popularne.","same_as_username":"Twoje hasło jest takie samo jak nazwa użytkownika.","same_as_email":"Twoje hasło jest takie samo jak twój e-mail.","ok":"Twoje hasło jest poprawne.","instructions":"Co najmniej %{count} znaków."},"associated_accounts":"Powiązane konta","ip_address":{"title":"Ostatni adres IP"},"registration_ip_address":{"title":"Adres IP rejestracji"},"avatar":{"title":"Awatar","header_title":"profil, wiadomości, zakładki i ustawienia"},"title":{"title":"Tytuł"},"filters":{"all":"Wszystkie"},"stream":{"posted_by":"Wysłane przez","sent_by":"Wysłane przez","private_message":"wiadomość","the_topic":"temat"}},"loading":"Wczytuję…","errors":{"prev_page":"podczas próby wczytania","reasons":{"network":"Błąd sieci","server":"błąd serwera","forbidden":"Brak dostępu","unknown":"Błąd","not_found":"Nie znaleziono strony"},"desc":{"network":"Sprawdź swoje połączenie.","network_fixed":"Chyba już w porządku.","server":"Kod błędu: {{status}}","forbidden":"Nie możesz obejrzeć tego zasobu.","not_found":"Ups, aplikacja próbowała otworzyć URL który nie istnieje.","unknown":"Coś poszło nie tak."},"buttons":{"back":"Cofnij","again":"Spróbuj ponownie","fixed":"Załaduj stronę"}},"close":"Zamknij","assets_changed_confirm":"Serwis został zmieniony, czy pozwolisz na przeładowanie strony w celu aktualizacji do najnowszej wersji?","logout":"Nastąpiło wylogowanie.","refresh":"Odśwież","read_only_mode":{"enabled":"Aktywowani tryb tylko-do-odczytu. Możesz nadal przeglądać serwis, ale operacje zmieniające stan i treść mogą nie działać.","login_disabled":"Logowanie jest zablokowane, gdy strona jest w trybie tylko do odczytu."},"too_few_topics_and_posts_notice":"Pora \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003erozruszać dyskusję!\u003c/a\u003e Aktualnie istnieje \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tematów i \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e wpisów. Odwiedzający potrzebują więcej tematów i konwersacji do czytania i pisania na ich temat.","too_few_topics_notice":"Pora \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003erozruszać dyskusję!\u003c/a\u003e Aktualnie istnieje \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tematów. Odwiedzający potrzebują więcej tematów i konwersacji do czytania i pisania na ich temat.","too_few_posts_notice":"Pora \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003erozruszać dyskusję!\u003c/a\u003e Aktualnie istnieje \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e wpisów. Odwiedzający potrzebują więcej tematów i konwersacji do czytania i pisania na ich temat.","learn_more":"dowiedz się więcej…","year":"rok","year_desc":"tematy dodane w ciągu ostatnich 365 dni","month":"miesiąc","month_desc":"tematy dodane w ciągu ostatnich 30 dni","week":"tydzień","week_desc":"tematy dodane w ciągu ostatnich 7 dni","day":"dzień","first_post":"Pierwszy wpis","mute":"Wycisz","unmute":"Wyłącz wyciszenie","last_post":"Ostatni wpis","last_reply_lowercase":"ostatnia odpowiedź","replies_lowercase":{"one":"odpowiedź","few":"odpowiedzi","other":"odpowiedzi"},"signup_cta":{"sign_up":"Rejestracja","hide_session":"Przypomnij mi jutro","hide_forever":"nie, dziękuję","hidden_for_session":"Ok, zapytamy jutro. Pamiętaj, że konto możesz w każdej chwili założyć klikając na 'Logowanie'.","intro":"Hej! :heart_eyes: Wygląda na to, że zainteresowała Cię dyskusja, ale nie posiadasz jeszcze konta.","value_prop":"Jeśli stworzysz konto, zapamiętamy przeczytane przez Ciebie wpisy i tematy, dzięki czemu zawsze powrócisz do odpowiedniego miejsca.  Otrzymasz też powiadomienia o nowych wpisach. Dodatkowo możliwe będzie polubienie ciekawych wpisów  :heartbeat:"},"summary":{"enabled_description":"Przeglądasz podsumowanie tego tematu: widoczne są jedynie najbardziej wartościowe wpisy zdaniem uczestników. ","description":"Istnieją \u003cb\u003e{{count}}\u003c/b\u003e odpowiedzi.","description_time":"Istnieją \u003cb\u003e{{count}}\u003c/b\u003e odpowiedzi z czasem czytania oszacowanym na \u003cb\u003e{{readingTime}} minut\u003c/b\u003e.","enable":"Podsumuj ten temat","disable":"Pokaż wszystkie wpisy"},"deleted_filter":{"enabled_description":"Ten temat posiada usunięte wpisy, które zostały ukryte.","disabled_description":"Usunięte wpisy w tym temacie są widoczne.","enable":"Ukryj usunięte wpisy","disable":"Pokaż usunięte wpisy."},"private_message_info":{"title":"Wiadomość","invite":"Zaproś innych","remove_allowed_user":"Czy naprawdę chcesz usunąć {{name}} z tej dyskusji?"},"email":"Email","username":"Nazwa konta","last_seen":"Ostatnio oglądane","created":"Utworzono","created_lowercase":"utworzono","trust_level":"Poziom zaufania","search_hint":"nazwa użytkownika, email lub IP","create_account":{"title":"Utwórz konto","failed":"Coś poszło nie tak, możliwe, że wybrany adres email jest już zarejestrowany, spróbuj użyć odnośnika przypomnienia hasła"},"forgot_password":{"title":"Reset hasła","action":"Zapomniałem(-łam) hasła","invite":"Wpisz swoją nazwę użytkownika lub adres email. Wyślemy do ciebie email z linkiem do zresetowania hasła.","reset":"Resetuj hasło","complete_username":"Jeśli jakieś mamy konto o nazwie użytkownika \u003cb\u003e%{username}\u003c/b\u003e, za chwilę zostanie wysłana wiadomość z instrukcją jak ustawić nowe hasło.","complete_email":"Jeśli jakieś konto użytkownika posiada adres \u003cb\u003e%{email}\u003c/b\u003e, za chwilę zostanie wysłana wiadomość z instrukcją jak ustawić nowe hasło.","complete_username_found":"Znaleziono konto o nazwie \u003cb\u003e%{username}\u003c/b\u003e,  wkrótce otrzymasz email z instrukcjami opisującymi reset hasła.","complete_email_found":"Znaleziono konto przypisane do adresu \u003cb\u003e%{email}\u003c/b\u003e,  wkrótce otrzymasz email z instrukcjami opisującymi reset hasła.","complete_username_not_found":"Nie znaleziono konta o nazwie \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Nie znaleziono konta przypisanego do \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Logowanie","username":"Użytkownik","password":"Hasło","email_placeholder":"adres email lub nazwa użytkownika","caps_lock_warning":"Caps Lock jest włączony","error":"Nieznany błąd","rate_limit":"Poczekaj, zanim ponowisz próbę logowania.","blank_username_or_password":"Podaj swój email lub nazwę użytkownika i hasło","reset_password":"Resetuj hasło","logging_in":"Uwierzytelnianie…","or":"Lub","authenticating":"Uwierzytelnianie…","awaiting_confirmation":"Twoje konto czeka na aktywację. Użyj odnośnika przypomnienia hasła, aby otrzymać kolejny email aktywujący konta.","awaiting_approval":"Twoje konto jeszcze nie zostało zatwierdzone przez osoby z obsługi. Otrzymasz email gdy zostanie zatwierdzone.","requires_invite":"Przepraszamy, dostęp do tego forum jest tylko za zaproszeniem.","not_activated":"Nie możesz się jeszcze zalogować. Wysłaliśmy email aktywujący konto na adres \u003cb\u003e{{sentTo}}\u003c/b\u003e. W celu aktywacji konta postępuj zgodnie z instrukcjami otrzymanymi w emailu.","not_allowed_from_ip_address":"Nie możesz się zalogować z tego adresu IP.","admin_not_allowed_from_ip_address":"Nie możesz się zalogować jako admin z tego adresu IP.","resend_activation_email":"Kliknij tutaj, aby ponownie wysłać email z aktywacją konta.","sent_activation_email_again":"Wysłaliśmy do ciebie kolejny email z aktywacją konta na \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Zanim dotrze, może minąć kilka minut; pamiętaj, żeby sprawdzić folder ze spamem.","to_continue":"Zaloguj się","preferences":"Musisz się zalogować, aby zmieniać swoje ustawienia.","forgot":"Nie pamiętam konta","google":{"title":"przez Google","message":"Uwierzytelnianie przy pomocy konta Google (upewnij się, że blokada wyskakujących okienek nie jest włączona)"},"google_oauth2":{"title":"przez Google","message":"Uwierzytelniam przy pomocy Google (upewnij się wyskakujące okienka nie są blokowane)"},"twitter":{"title":"przez Twitter","message":"Uwierzytelnianie przy pomocy konta na Twitterze (upewnij się, że blokada wyskakujących okienek nie jest włączona)"},"facebook":{"title":"przez Facebook","message":"Uwierzytelnianie przy pomocy konta Facebook (upewnij się, że blokada wyskakujących okienek nie jest włączona)"},"yahoo":{"title":"przez Yahoo","message":"Uwierzytelnianie przy pomocy konta Yahoo (upewnij się, że blokada wyskakujących okienek nie jest włączona)"},"github":{"title":"przez GitHub","message":"Uwierzytelnianie przez GitHub (upewnij się, że blokada wyskakujących okienek nie jest włączona)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"więcej…","options":"Opcje","whisper":"szept","add_warning":"To jest oficjalne ostrzeżenie.","toggle_whisper":"Przełącz szept","posting_not_on_topic":"W którym temacie chcesz odpowiedzieć?","saving_draft_tip":"zapisuję...","saved_draft_tip":"zapisano","saved_local_draft_tip":"zapisano lokalnie","similar_topics":"Twój temat jest podobny do…","drafts_offline":"szkice offline","error":{"title_missing":"tytuł jest wymagany","title_too_short":"tytuł musi zawierać co najmniej {{min}} znaków","title_too_long":"Tytuł nie może zawierać więcej niż {{max}} znaków","post_missing":"wpis nie może być pusty","post_length":"Wpis musi zawierać przynajmniej {{min}} znaków","try_like":"Może warto użyć przycisku \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Musisz wybrać kategorię"},"save_edit":"Zapisz zmiany","reply_original":"Odpowiedz na Oryginalny Temat","reply_here":"Odpowiedz tutaj","reply":"Odpowiedz","cancel":"Anuluj","create_topic":"Utwórz temat","create_pm":"Wiadomość","title":"Lub naciśnij Ctrl+Enter","users_placeholder":"Dodaj osobę","title_placeholder":"O czym jest ta dyskusja w jednym zwartym zdaniu. ","edit_reason_placeholder":"z jakiego powodu edytujesz?","show_edit_reason":"(dodaj powód edycji)","reply_placeholder":"Pisz w tym miejscu. Wspierane formatowanie to Markdown, BBCode lub HTML.  Możesz też przeciągnąć tu obrazek.","view_new_post":"Zobacz Twój nowy wpis.","saving":"Zapisywanie","saved":"Zapisano!","saved_draft":"Posiadasz zachowany szkic wpisu. Kliknij tu aby wznowić jego edycję.","uploading":"Wczytuję…","show_preview":"pokaż podgląd \u0026raquo;","hide_preview":"\u0026laquo; schowaj podgląd","quote_post_title":"Cytuj cały wpis","bold_title":"Pogrubienie","bold_text":"pogrubiony tekst","italic_title":"Wyróżnienie","italic_text":"wyróżniony tekst","link_title":"Odnośnik","link_description":"wprowadź tutaj opis odnośnika","link_dialog_title":"Wstaw odnośnik","link_optional_text":"opcjonalny tytuł","link_placeholder":"http://example.com \"opcjonalny tekst\"","quote_title":"Cytat","quote_text":"Cytat","code_title":"Tekst sformatowany","code_text":"Sformatowany blok tekstu poprzedź 4 spacjami","upload_title":"Dodaj","upload_description":"wprowadź opis tutaj","olist_title":"Lista numerowana","ulist_title":"Lista wypunktowana","list_item":"Element listy","heading_title":"Nagłówek","heading_text":"Nagłówek","hr_title":"Pozioma linia","help":"Pomoc formatowania Markdown","toggler":"ukryj lub pokaż panel kompozytora tekstu","modal_ok":"OK","modal_cancel":"Anuluj","cant_send_pm":"Przepraszamy, niestety nie możesz wysłać prywatnej wiadomości do %{username}.","admin_options_title":"Opcjonalne ustawienia obsługi dla tego tematu","auto_close":{"label":"Automatycznie zamykaj tematy po:","error":"Podaj poprawną wartość.","based_on_last_post":"Nie zamykaj tematu dopóki od ostatniego wpisu nie upłynie przynajmniej tyle czasu.","all":{"examples":"Podaj godzinę  (17:30), liczbę godzin (24) lub konkretną datę i czas (2013-11-22 14:00)."},"limited":{"units":"(# godzin)","examples":"Podaj liczbę godzin (24)."}}},"notifications":{"title":"powiadomienia o wywołanej @nazwie, odpowiedzi do twoich wpisów i tematów, prywatne wiadomości, itp","none":"Nie udało się załadować listy powiadomień.","more":"pokaż starsze powiadomienia","total_flagged":"wszystkie oflagowane wpisy","mentioned":"\u003ci title='wspomniano' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='cytat' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='odpowiedź' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='odpowiedź' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edycja' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='polubienie' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='prywatna wiadomość' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='prywatna wiadomość' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='zaproszenie do tematu' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='przyjęcie twojego zaproszenia' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e przyjmuje twoje zaproszenie\u003c/p\u003e","moved_post":"\u003ci title='przeniesienie wpisu' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e przenosi {{description}}\u003c/p\u003e","linked":"\u003ci title='powiązany wpis' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='otrzymano odznakę' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eOtrzymujesz '{{description}}'\u003c/p\u003e","alt":{"mentioned":"Wywołanie przez","quoted":"Cytowanie przez","replied":"Odpowiedź","posted":"Autor wpisu","edited":"Edycja twojego wpisu","liked":"Polubienie twojego wpisu","private_message":"Prywatna wiadomość od","invited_to_private_message":"Zaproszenie do prywatnej wiadomości od","invited_to_topic":"Zaproszenie do tematu od","invitee_accepted":"Zaproszenie zaakceptowane przez","moved_post":"Twój wpis został przeniesiony przez","linked":"Linkownie do twojego wpisu","granted_badge":"Przyznanie odznaki"},"popup":{"mentioned":"{{username}} wspomina o tobie w \"{{topic}}\" - {{site_title}}","quoted":"{{username}} cytuje cie w \"{{topic}}\" - {{site_title}}","replied":"{{username}} odpowiada na twój wpis w \"{{topic}}\" - {{site_title}}","posted":"{{username}} pisze w \"{{topic}}\" - {{site_title}}","private_message":"{{username}} wysyła ci prywatną wiadomość w \"{{topic}}\" - {{site_title}}","linked":"{{username}} linkuje do twojego wpisu z \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Dodaj obraz","title_with_attachments":"Dodaj obraz lub plik","from_my_computer":"Z mojego urządzenia","from_the_web":"Z Internetu","remote_tip":"link do obrazu","remote_tip_with_attachments":"link do obrazu lub pliku  {{authorized_extensions}}","local_tip":"wybierz obrazy ze swojego urządzenia","local_tip_with_attachments":"wybierz obrazy lub pliki ze swojego urządzenia {{authorized_extensions}}","hint":"(możesz także upuścić plik z katalogu komputera w okno edytora)","hint_for_supported_browsers":"możesz też przeciągać lub wklejać grafiki do edytora","uploading":"Wgrywanie","select_file":"Wybierz plik","image_link":"odnośnik do którego Twój obraz będzie kierował"},"search":{"sort_by":"Sortuj po","relevance":"Trafność","latest_post":"Aktualne wpisy","most_viewed":"Popularne","most_liked":"Lubiane","select_all":"Zaznacz wszystkie","clear_all":"Wyczyść wszystkie","result_count":{"one":"1 wynik dla \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","few":"{{count}} wyniki dla \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} wyników dla \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"szukaj tematów, wpisów, użytkowników lub kategorii","no_results":"Brak wyników wyszukiwania","no_more_results":"Nie znaleziono więcej wyników.","search_help":"Wyszukaj w pomocy","searching":"Szukam…","post_format":"#{{post_number}} za {{username}}","context":{"user":"Szukaj wpisów @{{username}}","category":"Szukaj w kategorii \"{{category}}\"","topic":"Szukaj w tym temacie","private_messages":"Wyszukiwanie wiadomości"}},"hamburger_menu":"przejdź do innej listy lub kategorii","new_item":"nowy","go_back":"wróć","not_logged_in_user":"strona użytkownika z podsumowaniem bieżących działań i ustawień","current_user":"idź do swojej strony użytkowanika","topics":{"bulk":{"unlist_topics":"Ukryj tematy","reset_read":"Wyzeruj przeczytane","delete":"Usuń tematy","dismiss":"Wyczyść","dismiss_read":"Wyczyść nieprzeczytane","dismiss_button":"Wyczyść…","dismiss_tooltip":"Wyczyść nowe wpisy lub przestań śledzić tematy","also_dismiss_topics":"Przestać śledzić wskazane tematy? (Nie pojawią się w zakładce nieprzeczytane)","dismiss_new":"Wyczyść nowe","toggle":"włącz grupowe zaznaczanie tematów","actions":"Operacje grupowe","change_category":"Zmień kategorię","close_topics":"Zamknij wpisy","archive_topics":"Zarchiwizuj tematy","notification_level":"Poziom powiadomień o zmianach","choose_new_category":"Wybierz nową kategorię dla tematów:","selected":{"one":"Zaznaczono \u003cb\u003e1\u003c/b\u003e temat.","few":"Zaznaczono \u003cb\u003e{{count}}\u003c/b\u003e tematy.","other":"Zaznaczono \u003cb\u003e{{count}}\u003c/b\u003e tematów."}},"none":{"unread":"Nie masz nieprzeczytanych tematów.","new":"Nie masz nowych tematów.","read":"You haven't read any topics yet.","posted":"Jeszcze nie zamieściłeś wpisu w żadnym z tematów.","latest":"Nie ma najnowszych tematów. Smutne.","hot":"Nie ma gorących tematów.","bookmarks":"Nie posiadasz tematów dodanych do zakładek.","category":"Nie ma tematów w kategorii {{category}}.","top":"Brak najlepszych tematów.","search":"Brak wyników wyszukiwania.","educate":{"new":"\u003cp\u003ePojawią się tu nowe tematy.\u003c/p\u003e\u003cp\u003eDomyślnie, tematy są traktowane jako \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enowe\u003c/span\u003e jeśli zostały utworzone w ciągu ostatnich 2 dni.\u003c/p\u003e\u003cp\u003eMożesz to zmienić w \u003ca href=\"%{userPrefsUrl}\"\u003eswoich ustawieniach\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003ePojawią się tu tematy oznaczone licznikiem \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e nieprzeczytanych wpisów.\u003c/p\u003e\n\u003cp\u003eDomyślnie, jako nieprzeczytane rozumiane są tematy:\u003c/p\u003e\u003cul\u003e\u003cli\u003etwojego autorstwa\u003c/li\u003e\u003cli\u003ete w których są twoje odpowiedzi \u003c/li\u003e\u003cli\u003eczytane przez ciebie dłużej niż 4 minuty\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eZnajdą się tu też te, którym ręcznie przyznano status Śledzony lub Obserwowany przyciskiem znajdującym się na końcu każdego tematu.\u003c/p\u003e\u003cp\u003eMożesz zmienić te zachowania w swoich \u003ca href=\"%{userPrefsUrl}\"\u003eustawieniach\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Nie ma więcej najnowszych tematów.","hot":"Nie ma więcej gorących tematów.","posted":"Nie ma więcej tematów w których pisałeś.","read":"Nie ma więcej przeczytanych tematów.","new":"Nie ma więcej nowych tematów.","unread":"Nie ma więcej nieprzeczytanych tematów.","category":"Nie ma więcej tematów w kategorii {{category}}.","top":"Nie ma już więcej najlepszych tematów.","bookmarks":"Nie ma więcej zakładek.","search":"Nie znaleziono więcej wyników."}},"topic":{"unsubscribe":{"stop_notifications":"Będziesz otrzymywać mniej powiadomień o \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Twój aktualny stan powiadomień to"},"filter_to":"{{post_count}} wpisów w temacie","create":"Nowy temat","create_long":"Utwórz nowy temat","private_message":"Napisz wiadomość","list":"Tematy","new":"nowy temat","unread":"nieprzeczytane","new_topics":{"one":"1 nowy temat","few":"{{count}} nowe tematy","other":"{{count}} nowych tematów"},"unread_topics":{"one":"1 nieprzeczytany temat","few":"{{count}} nieprzeczytane tematy","other":"{{count}} nieprzeczytanych tematów"},"title":"Temat","invalid_access":{"title":"Temat jest prywatny","description":"Przepraszamy, nie masz dostępu do tego tematu!","login_required":"Musisz się zalogować, aby zobaczyć ten temat."},"server_error":{"title":"Wystąpił błąd przy wczytywaniu Tematu","description":"Przepraszamy, nie możliwe było wczytanie tematu, możliwe że wystąpił problem z połączeniem. Prosimy, spróbuj ponownie. Jeżeli problem wystąpi ponownie, powiadom administrację."},"not_found":{"title":"Temat nie został znaleziony","description":"Przepraszamy, ale temat nie został znaleziony. Możliwe, że został usunięty przez moderatora?"},"total_unread_posts":{"one":"masz 1 nieprzeczytany wpis w tym temacie","few":"masz {{count}} nieprzeczytane wpisy w tym temacie","other":"masz {{count}} nieprzeczytanych wpisów w tym temacie"},"unread_posts":{"one":"masz 1 nieprzeczytany wpis w tym temacie","few":"masz {{count}} nieprzeczytane wpisy w tym temacie","other":"masz {{count}} nieprzeczytanych wpisów w tym temacie"},"new_posts":{"one":"od Twoich ostatnich odwiedzin pojawił się 1 nowy wpis","few":"od Twoich ostatnich odwiedzin pojawiły się {{count}} nowe wpisy","other":"od Twoich ostatnich odwiedzin pojawiło się {{count}} nowych wpisów"},"likes":{"one":"temat zawiera 1 polubienie","few":"temat zawiera {{count}} polubienia","other":"temat zawiera {{count}} polubień"},"back_to_list":"Wróć do Listy Tematów","options":"Opcje tematu","show_links":"pokaż odnośniki z tego tematu","toggle_information":"przełącz szczegóły tematu","read_more_in_category":"Chcesz przeczytać więcej? Przeglądaj inne tematy w {{catLink}} lub {{latestLink}}.","read_more":"Chcesz przeczytać więcej? {{catLink}} lub {{latestLink}}.","browse_all_categories":"Przeglądaj wszystkie kategorie","view_latest_topics":"pokaż aktualne tematy","suggest_create_topic":"Może rozpoczniesz temat?","jump_reply_up":"przeskocz do wcześniejszej odpowiedzi","jump_reply_down":"przeskocz do późniejszej odpowiedzi","deleted":"Temat został usunięty","auto_close_notice":"Ten temat zostanie automatycznie zamknięty %{timeLeft}.","auto_close_notice_based_on_last_post":"Ten temat zostanie automatycznie zamknięty %{duration} po ostatniej odpowiedzi.","auto_close_title":"Ustawienia automatycznego zamykania","auto_close_save":"Zapisz","auto_close_remove":"Nie zamykaj automatycznie tego tematu","progress":{"title":"postęp tematu","go_top":"początek","go_bottom":"koniec","go":"idź","jump_bottom":"Przejdź na koniec","jump_bottom_with_number":"przeskocz do wpisu %{post_number}","total":"w sumie wpisów","current":"obecny wpis","position":"wpis %{current} z %{total}"},"notifications":{"reasons":{"3_6":"Będziesz otrzymywać powiadomienia o każdym nowym wpisie i temacie, ponieważ obserwujesz tę kategorię.","3_5":"Będziesz otrzymywać powiadomienia o każdym nowym wpisie, ponieważ włączono automatyczne obserwowanie tego tematu.","3_2":"Będziesz otrzymywać powiadomienia o każdym nowym wpisie, ponieważ obserwujesz ten temat.","3_1":"Będziesz otrzymywać powiadomienia, ponieważ jesteś autorem tego tematu.","3":"Będziesz otrzymywać powiadomienia o każdym nowym wpisie, ponieważ obserwujesz ten temat.","2_8":"Będziesz otrzymywać powiadomienia, ponieważ śledzisz tę kategorię.","2_4":"Będziesz otrzymywać powiadomienia, ponieważ jesteś autorem odpowiedzi w tym temacie.","2_2":"Będziesz otrzymywać powiadomienia, ponieważ śledzisz ten temat.","2":"Będziesz otrzymywać powiadomienia, ponieważ \u003ca href=\"/users/{{username}}/preferences\"\u003eten temat został uznany za przeczytany\u003c/a\u003e.","1_2":"Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis.","1":"Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis.","0_7":"Ignorujesz wszystkie powiadomienia z tej kategorii.","0_2":"Ignorujesz wszystkie powiadomienia w tym temacie.","0":"Ignorujesz wszystkie powiadomienia w tym temacie."},"watching_pm":{"title":"Obserwuj wszystko","description":"Dostaniesz powiadomienie o każdym nowym wpisie w tej dyskusji. Liczba nowych wpisów pojawi się obok jej tytułu na liście wiadomości."},"watching":{"title":"Obserwuj wszystko","description":"Dostaniesz powiadomienie o każdym nowym wpisie w tym temacie. Liczba nowych wpisów pojawi się obok jego tytułu na liście wiadomości."},"tracking_pm":{"title":"Śledzenie","description":"Licznik nowych wpisów pojawi się obok tej dyskusji. Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis."},"tracking":{"title":"Śledzenie","description":"Licznik nowych odpowiedzi pojawi się obok tytułu tego tematu. Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis."},"regular":{"title":"Normalny","description":"Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis."},"regular_pm":{"title":"Normalny","description":"Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis."},"muted_pm":{"title":"Wyciszono","description":"Nie będziesz otrzymywać powiadomień dotyczących tej dyskusji."},"muted":{"title":"Wyciszenie","description":"Nie otrzymasz powiadomień o nowych wpisach w tym temacie. Nie pojawią się na liście nieprzeczytanych"}},"actions":{"recover":"Przywróć temat","delete":"Usuń temat","open":"Otwórz temat","close":"Zamknij temat","multi_select":"Wybierz wpisy…","auto_close":"Zamknij automatycznie…","pin":"Przypnij temat…","unpin":"Odepnij temat…","unarchive":"Przywróć z archiwum","archive":"Archiwizuj temat","invisible":"Ustaw jako niewidoczny","visible":"Ustaw jako widoczny","reset_read":"Zresetuj przeczytane dane"},"feature":{"pin":"Przypnij temat","unpin":"Odepnij temat","pin_globally":"Przypnij temat globalnie","make_banner":"Ustaw jako baner","remove_banner":"Wyłącz baner"},"reply":{"title":"Odpowiedz","help":"zacznij pisać odpowiedź"},"clear_pin":{"title":"Odepnij","help":"Odepnij ten temat. Przestanie wyświetlać się na początku listy tematów."},"share":{"title":"Udostępnij","help":"udostępnij odnośnik do tego tematu"},"flag_topic":{"title":"Zgłoś","help":"zgłoś ten temat, aby zwrócić uwagę moderacji lub wyślij powiadomienie o nim","success_message":"Ten temat został pomyślnie zgłoszony."},"feature_topic":{"title":"Wyróżnij ten temat","pin":"Wyróżnij ten temat przypinając go na górze w kategorii {{categoryLink}} do","confirm_pin":"Czy na pewno przypiąć ten temat w tej kategorii? Masz już {{count}} przypiętych tematów -- zbyt wiele może obniżyć czytelność innych aktywnych tematów.","unpin":"Odepnij ten temat z początku kategorii {{categoryLink}}.","unpin_until":"Odepnij ten temat z początku kategorii {{categoryLink}} lub poczekaj do \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Użytkownicy mogą przypinać tematy dla samych siebie.","pin_validation":"Przypięcie tego tematu wymaga podania daty.","not_pinned":"Brak przypiętych tematów w {{categoryLink}}.","pin_globally":"Wyróżnij ten temat przypinając go na górze wszystkich list do","confirm_pin_globally":"Czy na pewno chcesz globalnie przypiąć kolejny temat? Masz już {{count}} przypiętych tematów -- zbyt wiele może obniżyć czytelność innych aktywnych tematów.","unpin_globally":"Usuń wyróżnienie dla tego tematu odpinając go z początku wszystkich list.","unpin_globally_until":"Usuń wyróżnienie dla tego tematu odpinając go z początku wszystkich list lub poczekaj do \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Użytkownicy mogą przypinać tematy dla samych siebie.","not_pinned_globally":"Brak przypiętych globalnie tematów.","already_pinned_globally":{"one":"Tematy przypięte globalnie: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e.","few":"Tematy przypięte globalnie: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e.","other":"Tematy przypięte globalnie: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e."},"make_banner":"Ustaw ten temat jako baner wyświetlany na górze każdej strony.","remove_banner":"Usuń ten temat jako baner wyświetlany na górze każdej strony.","banner_note":"Użytkownicy mogą usunąć baner zamykając go przyciskiem. Tylko jeden temat może być banerem w danej chwili.","no_banner_exists":"Baner nie jest obecnie ustawiony.","banner_exists":"Baner \u003cstrong class='badge badge-notification unread'\u003ejest\u003c/strong\u003e obecnie ustawiony."},"inviting":"Zapraszam…","automatically_add_to_groups_optional":"To zaproszenie daje dostęp do tych grup: (opcjonalne, tylko dla admina)","automatically_add_to_groups_required":"To zaproszenie daje dostęp do tych grup: (\u003cb\u003eWymagane\u003c/b\u003e, tylko dla admina)","invite_private":{"title":"Zaproś do dyskusji","email_or_username":"Adres email lub nazwa użytkownika zapraszanej osoby","email_or_username_placeholder":"adres email lub nazwa użytkownika","action":"Zaproś","success":"Wskazany użytkownik został zaproszony do udziału w tej dyskusji.","error":"Przepraszamy, wystąpił błąd w trakcie zapraszania użytkownika(-czki).","group_name":"nazwa grupy"},"invite_reply":{"title":"Zaproś","username_placeholder":"nazwa użytkownika","action":"Wyślij zaproszenie","help":"zaproś innych do tego tematu e-mailem lub powiadomieniem","to_forum":"Wyślemy krótki email pozwalający twojemu znajomemu błyskawicznie dołączyć przez kliknięcie w link (bez logowania).","sso_enabled":"Podaj nazwę użytkownika lub e-mail osoby którą chcesz zaprosić do tego tematu.","to_topic_blank":"Podaj nazwę użytkownika lub e-mail osoby którą chcesz zaprosić do tego tematu.","to_topic_email":"Wprowadzony został adres e-mail. Wyślemy tam zaproszenie umożliwiające wskazanej osobie odpowiedź w tym temacie.","to_topic_username":"Konto o wprowadzonej nazwie użytkownika otrzyma powiadomienie z linkiem do tego tematu.","to_username":"Podaj nazwę użytkownika osoby którą chcesz zaprosić. Otrzyma powiadomienie z linkiem do tego tematu.","email_placeholder":"nazwa@example.com","success_email":"Wysłaliśmy zaproszenie do \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Otrzymasz powiadomienie, gdy zaproszenie zostanie przyjęte. Sprawdź zakładkę zaproszenia w swoim profilu, aby śledzić status tego i innych zaproszeń.","success_username":"Wskazany użytkownik został zaproszony do udziału w tym temacie.","error":"Przepraszamy, nie udało się zaprosić wskazanej osoby. Być może została już zaproszona? (Lub wysyłasz zbyt wiele zaproszeń)"},"login_reply":"Zaloguj się, aby odpowiedzieć","filters":{"n_posts":{"one":"1 wpis","few":"{{count}} wpisy","other":"{{count}} wpisów"},"cancel":"Usuń filtr"},"split_topic":{"title":"Przenieś do nowego tematu","action":"przenieś do nowego tematu","topic_name":"Nazwa Nowego Tematu","error":"Wystąpił błąd podczas przenoszenia wpisów do nowego tematu.","instructions":{"one":"Masz zamiar utworzyć nowy temat, składający się z wybranego przez ciebie wpisu.","few":"Masz zamiar utworzyć nowy temat, składający się z \u003cb\u003e{{count}}\u003c/b\u003e wybranych przez ciebie wpisów.","other":"Masz zamiar utworzyć nowy temat, składający się z \u003cb\u003e{{count}}\u003c/b\u003e wybranych przez ciebie wpisów."}},"merge_topic":{"title":"Przenieś do Istniejącego Tematu","action":"przenieś do istniejącego tematu","error":"Wystąpił błąd podczas przenoszenia wpisów do danego tematu.","instructions":{"one":"Wybierz temat, do którego chcesz przenieś ten wpis.","few":"Wybierz temat, do którego chcesz przenieść wybrane \u003cb\u003e{{count}}\u003c/b\u003e wpisy.","other":"Wybierz temat, do którego chcesz przenieść \u003cb\u003e{{count}}\u003c/b\u003e wybranych wpisów."}},"change_owner":{"title":"Zmień właściciela wpisów","action":"zmień właściciela","error":"Wystąpił błąd podczas zmiany właściciela wpisów.","label":"Nowy właściciel wpisów","placeholder":"nazwa nowego właściciela","instructions":{"one":"Wybierz nowego właściciela wpisu autorstwa \u003cb\u003e{{old_user}}\u003c/b\u003e.","few":"Wybierz nowego właściciela dla {{count}} wpisów autorstwa \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Wybierz nowego właściciela dla {{count}} wpisów autorstwa \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Przeszłe powiadomienia dla tego wpisu nie zostaną przypisane do nowego użytkownika. \u003cbr\u003eUwaga: Aktualnie, żadne dane uzależnione od wpisu nie są przenoszone do nowego użytkownika. Zachowaj ostrożność."},"change_timestamp":{"title":"Zmień znacznik czasu","action":"zmień znacznik czasu","invalid_timestamp":"Znacznik czasu nie może wskazywać na przyszłość.","error":"Wystąpił błąd podczas zmiany znacznika czasu tego tematu.","instructions":"Wybierz nowy znacznik czasu dla tematu. Wpisy w temacie zostaną zaktualizowane o tę samą różnicę."},"multi_select":{"select":"wybierz","selected":"wybrano ({{count}})","select_replies":"wybierz +replies","delete":"usuń wybrane","cancel":"anuluj wybieranie","select_all":"zaznacz wszystkie","deselect_all":"odznacz wszystkie","description":{"one":"Wybrano \u003cb\u003e1\u003c/b\u003e wpis.","few":"Wybrano \u003cb\u003e{{count}}\u003c/b\u003e wpisy.","other":"Wybrano \u003cb\u003e{{count}}\u003c/b\u003e wpisów."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"odpowiedz na ten cytat","edit":"Edycja {{link}} {{replyAvatar}} {{username}}","edit_reason":"Powód","post_number":"wpis {{number}}","last_edited_on":"ostatnia edycja wpisu","reply_as_new_topic":"Odpowiedz w nowym temacie","continue_discussion":"Kontynuując dyskusję z {{postLink}}:","follow_quote":"idź do cytowanego wpisu","show_full":"Pokaż pełny wpis","show_hidden":"Zobacz ukrytą zawartość.","deleted_by_author":{"one":"(wpis wycofany przez autora, zostanie automatycznie usunięty za %{count} godzinę, chyba że zostanie oflagowany) ","few":"(wpis wycofany przez autora, zostanie automatycznie usunięty za %{count} godziny, chyba że zostanie oflagowany) ","other":"(wpis wycofany przez autora, zostanie automatycznie usunięty za %{count} godzin, chyba że zostanie oflagowany) "},"expand_collapse":"rozwiń/zwiń","gap":{"one":"pokaż 1 ukrytą odpowiedź","few":"pokaż {{count}} ukryte odpowiedzi","other":"pokaż {{count}} ukrytych odpowiedzi"},"more_links":"{{count}} więcej…","unread":"Nieprzeczytany wpis","has_replies":{"one":"{{count}} odpowiedź","few":"{{count}} odpowiedzi","other":"{{count}} odpowiedzi"},"has_likes":{"one":"{{count}} polubienie","few":"{{count}} polubienia","other":"{{count}} polubień"},"has_likes_title":{"one":"1 osoba polubiła ten wpis","few":"{{count}} osoby polubiły ten wpis","other":"{{count}} osób polubiło ten wpis"},"has_likes_title_only_you":"polubiony wpis","has_likes_title_you":{"one":"ty i 1 inna osoba polubiliście ten wpis","few":"ty i {{count}} inne osoby polubiliście ten wpis","other":"ty i {{count}} innych osób polubiło ten wpis"},"errors":{"create":"Przepraszamy, podczas tworzenia twojego wpisu wystąpił błąd. Spróbuj ponownie.","edit":"Przepraszamy, podczas edytowania twojego wpisu wystąpił błąd. Spróbuj ponownie.","upload":"Przepraszamy, wystąpił błąd podczas wczytywania Twojego pliku. Proszę, spróbuj ponownie.","attachment_too_large":"Przepraszamy, ale plik, który chcesz wgrać jest za duży (maksymalny rozmiar to {{max_size_kb}}KB).","file_too_large":"Przepraszamy, plik który chcesz wczytać jest zbyt duży (maximum to {{max_size_kb}}kb)","too_many_uploads":"Przepraszamy, ale możesz wgrać tylko jeden plik naraz.","too_many_dragged_and_dropped_files":"Przepraszamy, możesz wczytać maksymalnie 10 plików naraz.","upload_not_authorized":"Przepraszamy, ale plik który chcesz wgrać jest niedozwolony (dozwolone rozszerzenia: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Przepraszamy, ale nowi użytkownicy nie mogą wgrywać obrazów.","attachment_upload_not_allowed_for_new_user":"Przepraszamy, ale nowi użytkownicy nie mogą wgrywać załączników.","attachment_download_requires_login":"Przepraszamy, musisz się zalogować, aby pobierać załączniki."},"abandon":{"confirm":"Czy na pewno chcesz porzucić ten wpis?","no_value":"Nie, pozostaw","yes_value":"Tak, porzuć"},"via_email":"ten wpis został dodany emailem","whisper":"ten wpis jest prywatnym szeptem do moderatorów","wiki":{"about":"to wpis typu Wiki:  zwykli użytkownicy mogą go edytować"},"archetypes":{"save":"Opcje zapisu"},"controls":{"reply":"zacznij tworzyć odpowiedź na ten wpis","like":"polub ten wpis","has_liked":"polubiono ten wpis","undo_like":"wycofaj polubienie","edit":"edytuj ten wpis","edit_anonymous":"Przykro nam, ale musisz być zalogowany aby edytować ten wpis.","flag":"oflaguj ten wpis lub wyślij powiadomienie o nim do moderatorów","delete":"usuń ten wpis","undelete":"przywróc ten wpis","share":"udostępnij odnośnik do tego wpisu","more":"Więcej","delete_replies":{"confirm":{"one":"Czy chcesz usunąć również bezpośrednią odpowiedź na ten wpis?","few":"Czy chcesz usunąć również {{count}} bezpośrednie odpowiedzi na ten wpis?","other":"Czy chcesz usunąć również {{count}} bezpośrednich odpowiedzi na ten wpis?"},"yes_value":"Tak, usuń też odpowiedzi","no_value":"Nie, tylko ten wpis"},"admin":"administracja wpisem (tryb wiki itp)","wiki":"Włącz tryb Wiki","unwiki":"Wyłącz tryb Wiki","convert_to_moderator":"Włącz kolor moderatora","revert_to_regular":"Wyłącz kolor moderatora","rebake":"Odśwież HTML","unhide":"Wycofaj ukrycie","change_owner":"Zmiana właściciela"},"actions":{"flag":"Oflaguj","defer_flags":{"one":"Odrocz flagę","few":"Odrocz flagi","other":"Odrocz flagi"},"it_too":{"off_topic":"Oflaguj też to","spam":"Oflaguj też to","inappropriate":"Oflaguj też to","custom_flag":"Oflaguj też to","bookmark":"Utwórz zakładkę","like":"Polub","vote":"Zagłosuj za tym"},"undo":{"off_topic":"Cofnij flagę","spam":"Cofnij flagę","inappropriate":"Cofnij flagę","bookmark":"Cofnij zakładkę","like":"Cofnij","vote":"Cofnij głos"},"people":{"off_topic":"{{icons}} oznaczyli jako nie-na-temat","spam":"{{icons}} oznaczyli jako spam","spam_with_url":"{{icons}} oznacza \u003ca href='{{postUrl}}'\u003eto jako spam\u003c/a\u003e","inappropriate":"{{icons}} oznaczyli jako niewłaściwe","notify_moderators":"{{icons}} powiadomiło moderatorów","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003epowiadomiło moderatorów\u003c/a\u003e","notify_user":"{{icons}} wysłana wiadomość","notify_user_with_url":"{{icons}} wysłana \u003ca href='{{postUrl}}'\u003ewiadomość\u003c/a\u003e","bookmark":"{{icons}} dodało to do zakładek","like":"{{icons}} lubi to","vote":"{{icons}} zagłosowało za tym"},"by_you":{"off_topic":"Oznaczono jako nie-na-temat","spam":"Oflagowano jako spam","inappropriate":"Oznaczono jako niewłaściwe","notify_moderators":"Oflagowano do moderacji","notify_user":"Wysłano wiadomość do tego użytkownika","bookmark":"Dodano zakładkę w tym wpisie","like":"Lubisz ten wpis","vote":"Zagłosowano na ten wpis"},"by_you_and_others":{"off_topic":{"one":"Ty i 1 inna osoba oznaczyliście to jako nie-na-temat.","few":"Ty i {{count}} inne osoby oznaczyliście to jako nie-na-temat.","other":"Ty i {{count}} innych osób oznaczyliście to jako nie-na-temat."},"spam":{"one":"Ty i 1 inna osoba oflagowaliście to jako spam.","few":"Ty i {{count}} inne osoby oflagowaliście to jako spam.","other":"Ty i {{count}} innych osób oflagowaliście to jako spam."},"inappropriate":{"one":"Ty i 1 inna osoba oflagowaliście to jako niewłaściwe.","few":"Ty i {{count}} inne osoby oflagowaliście to jako niewłaściwe.","other":"Ty i {{count}} innych osób oflagowaliście to jako niewłaściwe."},"notify_moderators":{"one":"Ty i 1 inna osoba oflagowaliście to do moderacji.","few":"Ty i {{count}} inne osoby oflagowaliście to do moderacji.","other":"Ty i {{count}} innych osób oflagowaliście to do moderacji."},"notify_user":{"one":"Ty i 1 inna osoba wysłaliście wiadomość do tego użytkownika","few":"Ty i {{count}} inne osoby wysłaliście wiadomość do tego użytkownika","other":"Ty i {{count}} innych osób wysłaliście wiadomość do tego użytkownika"},"bookmark":{"one":"Ty i 1 inna osoba dodaliście ten wpis do zakładek.","few":"Ty i {{count}} inne osoby dodaliście ten wpis do zakładek.","other":"Ty i {{count}} innych osób dodaliście ten wpis do zakładek."},"like":{"one":"Ty i 1 inna osoba lubicie to.","few":"Ty i {{count}} inne osoby lubicie to.","other":"Ty i {{count}} innych osób lubicie to."},"vote":{"one":"Ty i 1 inna osoba zagłosowaliście za tym wpisem","few":"Ty i {{count}} inne osoby zagłosowaliście za tym wpisem","other":"Ty i {{count}} innych osób zagłosowaliście za tym wpisem"}},"by_others":{"off_topic":{"one":"1 osoba oflagowała to jako nie-na-temat","few":"{{count}} osoby oflagowały to jako nie-na-temat","other":"{{count}} osób oflagowało to jako nie-na-temat"},"spam":{"one":"1 osoba oflagowała to jako spam","few":"{{count}} osoby oflagowały to jako spam","other":"{{count}} osób oflagowało to jako spam"},"inappropriate":{"one":"1 osoba oflagowała to jako niewłaściwe","few":"{{count}} osoby oflagowały to jako niewłaściwe","other":"{{count}} osób oflagowało to jako niewłaściwe"},"notify_moderators":{"one":"1 osoba oflagowała to do moderacji","few":"{{count}} osoby oflagowały to do moderacji","other":"{{count}} osób oflagowało to do moderacji"},"notify_user":{"one":"1 osoba wysłała wiadomość do tego użytkownika","few":"{{count}} osoby wysłały wiadomość do tego użytkownika","other":"{{count}} osób wysłało wiadomość do tego użytkownika"},"bookmark":{"one":"1 osoba dodała ten wpis do zakładek","few":"{{count}} osoby dodały ten wpis do zakładek","other":"{{count}} osób dodało ten wpis do zakładek"},"like":{"one":"1 osoba lubi to","few":"{{count}} osoby lubią to","other":"{{count}} osób lubi to"},"vote":{"one":"1 osoba zagłosowała za tym wpisem","few":"{{count}} osoby zagłosowały za tym wpisem","other":"{{count}} osób zagłosowało za tym wpisem"}}},"delete":{"confirm":{"one":"Jesteś pewny(-a), że chcesz usunąć ten wpis?","few":"Jesteś pewny(-a), że chcesz usunąć te wszystkie wpisy?","other":"Czy na pewno chcesz usunąć te wszystkie wpisy?"}},"revisions":{"controls":{"first":"Pierwsza wersja","previous":"Poprzednia wersja","next":"Następna wersja","last":"Ostatnia wersja","hide":"Ukryj tę wersję","show":"Pokaż tę wersję","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Pokaż opublikowaną wersję wraz z elementami dodanymi i usuniętymi w treści.","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Pokaż wersje opublikowane do porównania obok siebie.","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Pokaż porównanie źródeł w formie tekstowej obok siebie","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Tekst"}}}},"category":{"can":"może\u0026hellip; ","none":"(brak kategorii)","all":"Wszystkie kategorie","choose":"Wybierz kategorię\u0026hellip;","edit":"edytuj","edit_long":"Edytuj","view":"Pokaż Tematy w Kategorii","general":"Ogólne","settings":"Ustawienia","topic_template":"Szablon tematu","delete":"Usuń kategorię","create":"Nowa kategoria","create_long":"Utwórz nową kategorię","save":"Zapisz kategorię","slug":"Slug kategorii","slug_placeholder":"(opcjonalne) słowa-z-myślnikiem dla URLi","creation_error":"Podczas tworzenia tej kategorii wystąpił błąd.","save_error":"Podczas zapisywania tej kategorii wystąpił błąd.","name":"Nazwa kategorii","description":"Opis","topic":"temat kategorii","logo":"Grafika z logo kategorii","background_image":"Grafika z tłem kategorii","badge_colors":"Kolor Etykiety","background_color":"Kolor tła","foreground_color":"Kolor Pierwszego Planu","name_placeholder":"Maksymalnie jedno lub dwa słowa","color_placeholder":"Dowolny kolor sieciowy","delete_confirm":"Czy na pewno chcesz usunąć tę kategorię?","delete_error":"Podczas próby usunięcia tej kategorii wystąpił błąd.","list":"Pokaż kategorie","no_description":"Proszę dodaj opis do tej kategorii.","change_in_category_topic":"Edytuj opis","already_used":"Ten kolor jest używany przez inną kategorię","security":"Bezpieczeństwo","special_warning":"Uwaga: Ta kategoria jest generowana automatycznie i jej ustawienia bezpieczeństwa nie mogą być edytowane. Jeśli nie zamierzasz jej używać, skasuj ją, zamiast zmieniać jej przeznaczenie.","images":"Obrazy","auto_close_label":"Automatycznie zamykaj tematy po:","auto_close_units":"godzin","email_in":"Dedykowany adres email kategorii:","email_in_allow_strangers":"Akceptuj wiadomości email od anonimowych, nieposiadających kont użytkowników ","email_in_disabled":"Tworzenie nowych tematów emailem jest wyłączone w ustawieniach serwisu. ","email_in_disabled_click":"Kliknij tu, aby włączyć.","suppress_from_homepage":"Nie wyświetlaj tej kategorii na stronie głównej.","allow_badges_label":"Włącz przyznawanie odznak na podstawie aktywności w tej kategorii","edit_permissions":"Edytuj uprawnienia","add_permission":"Dodaj uprawnienie","this_year":"ten rok","position":"pozycja","default_position":"Domyślna pozycja","position_disabled":"Kolejność kategorii będzie uzależniona od aktywności. Aby kontrolować ich kolejność,","position_disabled_click":"włącz statyczną kolejność kategorii","parent":"Kategoria rodzica","notifications":{"watching":{"title":"Obserwuj wszystko","description":"Będziesz automatycznie śledzić wszystkie nowe tematy w tych kategoriach. Otrzymasz powiadomienie o każdym nowym wpisie i temacie. Wyświetlimy liczbę nowych odpowiedzi na liście tematów."},"tracking":{"title":"Śledzona","description":"Będziesz automatycznie śledzić wszystkie tematy w tych kategoriach. Otrzymasz powiadomienie jeśli ktoś wspomni twój @login lub odpowie na twój wpis. Licznik nowych odpowiedzi pojawi się na liście tematów."},"regular":{"title":"Normalny","description":"Dostaniesz powiadomienie jedynie, gdy ktoś wspomni twoją @nazwę lub odpowie na twój wpis."},"muted":{"title":"Wyciszone","description":"Nie otrzymasz powiadomień o nowych tematach w tych kategoriach. Nie pojawią się na liście nieprzeczytanych."}}},"flagging":{"title":"Dziękujemy za pomoc w utrzymaniu porządku w naszej społeczności!","private_reminder":"oflagowania są poufne i widoczne \u003cb\u003ejedynie\u003c/b\u003e dla obsługi serwisu","action":"Oflaguj wpis","take_action":"Podejmij działanie","notify_action":"Wiadomość","delete_spammer":"Usuń spamera","delete_confirm":"Zamierzasz usunąć\u003cb\u003e%{posts}\u003c/b\u003e wpisów i \u003cb\u003e%{topics}\u003c/b\u003e tematów użytkownika, usunąć jest konto, zablokować możliwość zakładania kont z jego adresu IP \u003cb\u003e%{ip_address}\u003c/b\u003e i dodać jego email \u003cb\u003e%{email}\u003c/b\u003e do listy trwale zablokowanych. Czy na pewno ten użytkownik jest spamerem?","yes_delete_spammer":"Tak, usuń spamera","ip_address_missing":"(N/D)","hidden_email_address":"(ukryto)","submit_tooltip":"Zapisz prywatną flagę.","take_action_tooltip":"Nie czekaj, aż wpis zostanie zgłoszony przez innych,  natychmiast oflaguj do działania . ","cant":"Przepraszamy, nie możesz oflagować teraz tego wpisu.","notify_staff":"Powiadom administrację","formatted_name":{"off_topic":"Jest nie-na-temat","inappropriate":"Jest nieodpowiednie","spam":"Jest odebrane jako spam"},"custom_placeholder_notify_user":"Napisz konkretnie, konstuktywnie i kulturalnie.","custom_placeholder_notify_moderators":"Dlaczego ten wpis wymaga uwagi moderatora? Opisz co konkretnie Cię zaniepokoiło i jeśli to możliwe umieść odpowiednie odnośniki.","custom_message":{"at_least":"wprowadź co najmniej {{n}} znaków","more":"{{n}} aby wysłać…","left":"{{n}} pozostało"}},"flagging_topic":{"title":"Dziękujemy za pomoc w utrzymaniu porządku w naszej społeczności!","action":"Zgłoś temat","notify_action":"Wiadomość"},"topic_map":{"title":"Podsumowanie tematu","participants_title":"Najczęściej piszą","links_title":"Popularne linki","links_shown":"pokaż wszystkie {{totalLinks}} odnośników…","clicks":{"one":"1 kliknięcie","few":"%{count} kliknięć","other":"%{count} kliknięć"}},"topic_statuses":{"warning":{"help":"To jest oficjalne ostrzeżenie."},"bookmarked":{"help":"Temat został dodany do zakładek."},"locked":{"help":"Temat został zamknięty. Dodawanie nowych odpowiedzi nie jest możliwe."},"archived":{"help":"Ten temat został zarchiwizowany i nie można go zmieniać"},"locked_and_archived":{"help":"Ten temat jest zamknięty i zarchiwizowany. Dodawanie odpowiedzi i jego edycja nie są  możliwe."},"unpinned":{"title":"Nieprzypięty","help":"Temat nie jest przypięty w ramach twojego konta. Będzie wyświetlany w normalnej kolejności."},"pinned_globally":{"title":"Przypięty globalnie","help":"Ten temat jest przypięty globalnie. Będzie wyświetlany na początku głównej listy oraz swojej kategorii."},"pinned":{"title":"Przypięty","help":"Temat przypięty dla twojego konta. Będzie wyświetlany na początku swojej kategorii."},"invisible":{"help":"Temat jest niewidoczny: nie będzie wyświetlany na listach tematów a dostęp do niego można uzyskać jedynie poprzez link bezpośredni"}},"posts":"Wpisy","posts_lowercase":"wpisy","posts_long":"jest {{number}} wpisów w tym temacie","original_post":"Oryginalny wpis","views":"Odsłony","views_lowercase":{"one":"odsłona","few":"odsłony","other":"odsłon"},"replies":"Odpowiedzi","views_long":"ten temat był oglądany {number}} razy","activity":"Aktywność","likes":"Polubienia","likes_lowercase":{"one":"polubienie","few":"polubienia","other":"polubień"},"likes_long":"jest {{number}} polubień w tym temacie","users":"Użytkownicy","users_lowercase":{"one":"użytkownik","few":"użytkownicy","other":"użytkowników"},"category_title":"Kategoria","history":"Historia","changed_by":"przez {{author}}","raw_email":{"title":"Źródło emaila","not_available":"Niedostępne!"},"categories_list":"Lista Kategorii","filters":{"with_topics":"%{filter} tematy","with_category":"%{filter} tematy w %{category} ","latest":{"title":"Aktualne","title_with_count":{"one":"Aktualne (1)","few":"Aktualne ({{count}})","other":"Aktualne ({{count}})"},"help":"tematy z ostatnimi wpisami"},"hot":{"title":"Gorące","help":"wybrane najbardziej gorące tematy"},"read":{"title":"Przeczytane","help":"tematy które przeczytałeś, w kolejności od ostatnio przeczytanych"},"search":{"title":"Wyszukiwanie","help":"szukaj we wszystkich tematach"},"categories":{"title":"Kategorie","title_in":"Kategoria - {{categoryName}}","help":"wszystkie tematy zgrupowane przez kategorię"},"unread":{"title":"Nieprzeczytane","title_with_count":{"one":"Nieprzeczytane (1)","few":"Nieprzeczytane ({{count}})","other":"Nieprzeczytane ({{count}})"},"help":"obserwowane lub śledzone tematy z nieprzeczytanymi wpisami","lower_title_with_count":{"one":"1 nieprzeczytany","few":"{{count}} nieprzeczytane","other":"{{count}} nieprzeczytanych"}},"new":{"lower_title_with_count":{"one":"1 nowa","few":"{{count}} nowe","other":"{{count}} nowych"},"lower_title":"nowe","title":"Nowe","title_with_count":{"one":"Nowe (1)","few":"Nowe ({{count}})","other":"Nowe ({{count}})"},"help":"tematy dodane w ciągu ostatnich kilku dni"},"posted":{"title":"Wysłane","help":"tematy w których pisałeś"},"bookmarks":{"title":"Zakładki","help":"tematy dodane do zakładek"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","few":"{{categoryName}} ({{count}})","other":"{{categoryName}} ({{count}})"},"help":"najnowsze tematy w kategorii {{categoryName}}"},"top":{"title":"Popularne","help":"popularne tematy w ubiegłym roku, miesiącu, tygodniu lub dniu","all":{"title":"Cały czas"},"yearly":{"title":"Rocznie"},"quarterly":{"title":"Kwartalnie"},"monthly":{"title":"Miesięcznie"},"weekly":{"title":"Tygodniowo"},"daily":{"title":"Dziennie"},"all_time":"Cały czas","this_year":"Rok","this_quarter":"Kwartał","this_month":"Miesiąc","this_week":"Tydzień","today":"Dzisiaj","other_periods":"zobacz najważniejsze"}},"browser_update":"Niestety \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003etwoja przeglądarka jest zbyt przestarzała, aby obsłużyć ten serwis\u003c/a\u003e. Prosimy \u003ca href=\"http://browsehappy.com\"\u003ezaktualizuj swoją przeglądarkę\u003c/a\u003e.","permission_types":{"full":"tworzyć / odpowiadać / przeglądać","create_post":"odpowiadać / przeglądać","readonly":"przeglądać"},"docker":{"upgrade":"Aktualizacje wykonuje Docker.","perform_upgrade":"Kliknij, aby zaktualizować."},"poll":{"voters":{"one":"głosujący","few":"głosujących","other":"głosujących"},"total_votes":{"one":"oddanych głosów","few":"oddanych głosów","other":"oddanych głosów"},"average_rating":"Średnia ocena: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"Musisz wybrać \u003cstrong\u003eprzynajmniej jedną\u003c/strong\u003e pozycje.","few":"Musisz wybrać co najmniej \u003cstrong\u003e%{count}\u003c/strong\u003e pozycje.","other":"Musisz wybrać co najmniej \u003cstrong\u003e%{count}\u003c/strong\u003e pozycje."},"up_to_max_options":{"one":"Możesz wybrać maksymalnie \u003cstrong\u003e1\u003c/strong\u003e opcję.","few":"Możesz wybrać maksymalnie \u003cstrong\u003e%{count}\u003c/strong\u003e opcje.","other":"Możesz wybrać maksymalnie \u003cstrong\u003e%{count}\u003c/strong\u003e opcji."},"x_options":{"one":"Musisz wybrać \u003cstrong\u003ejedną\u003c/strong\u003e opcję.","few":"Musisz wybrać \u003cstrong\u003e%{count}\u003c/strong\u003e opcje.","other":"Musisz wybrać \u003cstrong\u003e%{count}\u003c/strong\u003e opcji."},"between_min_and_max_options":"Możesz wybrać pomiędzy \u003cstrong\u003e%{min}\u003c/strong\u003e a \u003cstrong\u003e%{max}\u003c/strong\u003e pozycjami."}},"cast-votes":{"title":"Oddaj głos","label":"Oddaj głos!"},"show-results":{"title":"Wyświetl wyniki ankiety","label":"Pokaż wyniki"},"hide-results":{"title":"Wróć do oddanych głosów","label":"Ukryj wyniki"},"open":{"title":"Otwórz ankietę","label":"Otwórz","confirm":"Czy na pewno chcesz otworzyć tę ankietę?"},"close":{"title":"Zamknij ankietę","label":"Zamknij","confirm":"Czy na pewno chcesz zamknąć tę ankietę?"},"error_while_toggling_status":"Wystąpił błąd podczas zmiany statusu tej ankiety.","error_while_casting_votes":"Wystąpił błąd podczas oddawania twoich głosów."},"type_to_filter":"pisz, aby filtrować…","admin":{"title":"Administrator Discourse","moderator":"Moderator","dashboard":{"title":"Raporty","last_updated":"Ostatnia aktualizacja panelu kontrolnego:","version":"Wersja","up_to_date":"Wersja Aktualna!","critical_available":"Ważna aktualizacja jest dostępna.","updates_available":"Aktualizacje są dostępne.","please_upgrade":"Koniecznie zaktualizuj!","no_check_performed":"Sprawdzanie dostępności aktualizacji nie jest wykonywane. Sprawdź działa czy sidekiq.","stale_data":"Sprawdzanie dostępności aktualizacji nie było ostatnio wykonywane. Sprawdź działa czy sidekiq.","version_check_pending":"Wygląda na to że ostatnio była wykonana aktualizacja. Fantastycznie!","installed_version":"Zainstalowana","latest_version":"Najnowsza","problems_found":"Wykryto pewne problemy w Twojej instalacji Discourse:","last_checked":"Ostatnio sprawdzana","refresh_problems":"Odśwież","no_problems":"Nie znaleziono problemów.","moderators":"Moderatorzy:","admins":"Adminstratorzy:","blocked":"Zablokowani:","suspended":"Zawieszeni:","private_messages_short":"Wiad.","private_messages_title":"Wiadomości","mobile_title":"Mobile","space_free":"{{size}} wolne","uploads":"załączniki","backups":"kopie zapasowe","traffic_short":"Ruch","traffic":"Zapytania do aplikacji","page_views":"Zapytania API","page_views_short":"Zapytania API","show_traffic_report":"Pokaż szczegółowy raport ruchu","reports":{"today":"Dzisiaj","yesterday":"Wczoraj","last_7_days":"Ostatnie 7 dni","last_30_days":"Ostatnie 30 dni","all_time":"Przez cały czas","7_days_ago":"7 dni temu","30_days_ago":"30 dni temu","all":"Wszystkie","view_table":"tabela","view_chart":"wykres słupkowy","refresh_report":"Odśwież raport","start_date":"Data początkowa","end_date":"Data końcowa"}},"commits":{"latest_changes":"Ostatnie zmiany: aktualizuj często!","by":"przez"},"flags":{"title":"Flagi","old":"Stare","active":"Aktywność","agree":"Potwierdź","agree_title":"Potwierdź to zgłoszenie jako uzasadnione i poprawne","agree_flag_modal_title":"Potwierdź i…","agree_flag_hide_post":"Potwierdź (ukryj post i wyślij PW)","agree_flag_hide_post_title":"Ukryj ten wpis i automatycznie wyślij użytkownikowi  wiadomość informującą, że wpis wymaga przeredagowania","agree_flag_restore_post":"Zgoda (przywróć wpis)","agree_flag_restore_post_title":"Przywróć ten wpis","agree_flag":"Potwierdź flagę","agree_flag_title":"Potwierdź flagę i zostaw wpis bez zmian","defer_flag":"Zignoruj","defer_flag_title":"Usunięcie flagi z twojej listy, nie wymaga dalszych działań.","delete":"Usuń","delete_title":"Usuń wpis do którego odnosi się flaga.","delete_post_defer_flag":"Usuń wpis i zignoruj flagę","delete_post_defer_flag_title":"Usuń wpis. Jeśli jest pierwszym w temacie, usuń temat.","delete_post_agree_flag":"Usuń post i potwierdź flagę","delete_post_agree_flag_title":"Usuń wpis. Jeśli jest pierwszym w temacie, usuń temat.","delete_flag_modal_title":"Usuń i…","delete_spammer":"Usuń spamera","delete_spammer_title":"Usuwa konto tego użytkownika oraz wszystkie tematy i wpisy jakie nim utworzono.","disagree_flag_unhide_post":"Wycofaj (pokaż wpis)","disagree_flag_unhide_post_title":"Usuń wszystkie flagi z tego wpisu i uczyń go widocznym ponownie.","disagree_flag":"Wycofaj","disagree_flag_title":"Wycofaj nieuzasadnioną flagę.","clear_topic_flags":"Zrobione","clear_topic_flags_title":"Ten temat został sprawdzony i związane z nim problemy zostały rozwiązane. Kliknij Zrobione, aby usunąć flagi.","more":"(więcej odpowiedzi…)","dispositions":{"agreed":"potwierdzono","disagreed":"wycofano","deferred":"zignorowano"},"flagged_by":"Oflagowano przez","resolved_by":"Rozwiązano przez","took_action":"Podjęto działanie","system":"System","error":"Coś poszło nie tak","reply_message":"Odpowiedz","no_results":"Nie ma flag.","topic_flagged":"Ten \u003cstrong\u003etemat\u003c/strong\u003e został oflagowany.","visit_topic":"Odwiedź temat by podjąć działania.","was_edited":"Wpis został zmieniony po pierwszej fladze","previous_flags_count":"Ten wpis został do tej pory oznaczony flagą {{count}} razy.","summary":{"action_type_3":{"one":"nie-na-temat","few":"nie-na-temat x{{count}}","other":"nie-na-temat x{{count}}"},"action_type_4":{"one":"nieodpowiednie","few":"nieodpowiednie x{{count}}","other":"nieodpowiednie x{{count}}"},"action_type_6":{"one":"niestandardowy","few":"niestandardowe x{{count}}","other":"niestandardowych x{{count}}"},"action_type_7":{"one":"niestandardowy","few":"niestandardowe x{{count}}","other":"niestandardowych x{{count}} "},"action_type_8":{"one":"spam","few":"spam x{{count}}","other":"spam x{{count}}"}}},"groups":{"primary":"Główna grupa","no_primary":"(brak podstawowej grupy)","title":"Grupy","edit":"Edytuj grupy","refresh":"Odśwież","new":"Nowa","selector_placeholder":"nazwa użytkownika","name_placeholder":"Nazwa grupy: bez spacji, takie same zasady jak przy nazwie użytkownika","about":"Tu możesz edytować przypisania do grup oraz ich nazwy","group_members":"Członkowie grupy","delete":"Usuń","delete_confirm":"Usunąć tę grupę?","delete_failed":"Nie można usunąć grupy. Jeżeli jest to grupa automatyczna, nie może zostać zniszczona.","delete_member_confirm":"Usunąć '%{username}' z grupy '%{group}' ?","delete_owner_confirm":"Usunąć status właściciela dla  '%{username}'?","name":"Nazwa","add":"Dodaj","add_members":"Dodaj członków","custom":"Niestandardowe","bulk_complete":"Użytkownicy zostali dodani do wskazanej grupy.","bulk":"Dodaj więcej do grupy","bulk_paste":"Podaj listę nazw użytkowników lub adresów e-mail,  każdy w oddzielnej linii:","bulk_select":"(wybierz grupę)","automatic":"Automatyczne","automatic_membership_email_domains":"Użytkownicy rejestrujący się przy pomocy adresu z tej listy zostaną automatycznie przypisani do tej grupy.","automatic_membership_retroactive":"Zastosuj tę regułę domenową do już istniejących użytkowników.","default_title":"Domyślny tytuł użytkowników należących do tej grupy","primary_group":"Automatycznie ustawiaj jako główną grupę","group_owners":"Właściciele","add_owners":"Dodaj właścicieli"},"api":{"generate_master":"Generuj Master API Key","none":"Nie ma teraz aktywnych kluczy API.","user":"Użytkownik","title":"API","key":"Klucz API","generate":"Generuj","regenerate":"Odnów","revoke":"Unieważnij","confirm_regen":"Czy na pewno chcesz zastąpić ten API Key nowym?","confirm_revoke":"Czy na pewno chcesz unieważnić ten klucz?","info_html":"Twoje klucze API dają dostęp do tworzenia i aktualizowania tenatów przez wywołania JSON.","all_users":"Wszyscy użytkownicy","note_html":"Zachowaj ten klucz \u003cstrong\u003ew tajemnicy\u003c/strong\u003e, wszyscy którzy go posiadają mogą tworzyć wpisy jako dowolny użytkownik."},"plugins":{"title":"Wtyczki","installed":"Zainstalowane wtyczki","name":"Nazwa","none_installed":"Brak zainstalowanych wtyczek.","version":"Wersja","enabled":"Włączono?","is_enabled":"T","not_enabled":"N","change_settings":"Zmień ustawienia","change_settings_short":"Ustawienia","howto":"Jak zainstalować wtyczkę?"},"backups":{"title":"Kopie zapasowe","menu":{"backups":"Kopie zapasowe","logs":"Logi"},"none":"Brak kopii zapasowych.","read_only":{"enable":{"title":"Włącz tryb tylko do odczytu","label":"Włącz tryb tylko do odczytu","confirm":"Czy na pewno chcesz włączyć tryb tylko do odczytu?"},"disable":{"title":"Wyłącz tryb tylko do odczytu","label":"Wyłącz tryb tylko do odczytu"}},"logs":{"none":"Póki co brak logów…"},"columns":{"filename":"Nazwa pliku","size":"Rozmiar"},"upload":{"label":"Wyślij","title":"Wyślij kopię zapasową do tej instancji","uploading":"Wysyłanie…","success":"'{{filename}}' został pomyślnie przesłany.","error":"Podczas przesyłania pliku wystąpił błąd '{{filename}}': {{message}}"},"operations":{"is_running":"Proces jest w trakcie działania…","failed":"Proces {{operation}} zakończył się niepowodzeniem. Sprawdź logi.","cancel":{"label":"Anuluj","title":"Anuluj bieżącą operację","confirm":"Czy na pewno chcesz anulować bieżącą operację?"},"backup":{"label":"Kopia zapasowa","title":"Wykonaj kopię zapasową","confirm":"Czy chcesz wykonać kopię zapasową?","without_uploads":"Tak (bez załączników)"},"download":{"label":"Pobierz","title":"Pobierz kopię zapasową"},"destroy":{"title":"Usuń kopię zapasową","confirm":"Czy na pewno chcesz zniszczyć tą kopię zapasową?"},"restore":{"is_disabled":"Przywracanie jest zablokowane w ustawieniach.","label":"Przywróć","title":"Przywróć kopię zapasową","confirm":"Czy na pewno chcesz przywrócić tą kopię zapasową?"},"rollback":{"label":"Wycofaj","title":"Wycofaj bazę danych do poprzedniego poprawnego stanu","confirm":"Czy na pewno chcesz przywrócić bazę danych do poprzedniego poprawnego stanu?"}}},"export_csv":{"user_archive_confirm":"Czy na pewno chcesz pobrać swoje wszystkie wpisy?","success":"Rozpoczęto eksport: otrzymasz wiadomość, gdy proces zostanie zakończony.","failed":"Eksport zakończył się niepowodzeniem. Sprawdź logi.","rate_limit_error":"Wpisy mogą być pobierane raz dziennie, spróbuj ponownie jutro.","button_text":"Eksportuj","button_title":{"user":"Eksportuj listę wszystkich użytkowników do formatu CSV.","staff_action":"Eksportuj log zmian wykonanych przez zespół do formatu CSV.","screened_email":"Eksportuj listę monitorowanych adresów email do formatu CSV.","screened_ip":"Eksportuj listę monitorowanych IP do formatu CSV.","screened_url":"Eksportuj listę monitorowanych URLi do formatu CSV."}},"export_json":{"button_text":"Eksport"},"invite":{"button_text":"Wyślij zaproszenia","button_title":"Wysyłanie zaproszeń"},"customize":{"title":"Wygląd","long_title":"Personalizacja strony","css":"CSS","header":"Nagłówki","top":"Nagłówek","footer":"Stopka","embedded_css":"Osadzony CSS","head_tag":{"text":"\u003c/head\u003e","title":"Kod HTML, który zostanie umieszczony przed tagiem \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"Kod HTML, który zostanie umieszczony przed tagiem \u003c/body\u003e."},"override_default":"Nie dołączaj standardowego arkusza stylów","enabled":"Włączone?","preview":"podgląd","undo_preview":"usuń podgląd","rescue_preview":" domyślny styl","explain_preview":"Podejrzyj witrynę z użyciem tego sylesheet'u","explain_undo_preview":"Wróć do aktualnie aktywnego schematu styli","explain_rescue_preview":"Zobacz stronę z domyślnym stylem","save":"Zapisz","new":"Nowy","new_style":"Nowy styl","import":"Import","import_title":"Wybierz plik lub wklej tekst","delete":"Usuń","delete_confirm":"Usunąć tę personalizację?","about":"Zmień arkusze stylów CSS i nagłówki HTML w witrynie. Dodaj własne ustawienie aby rozpocząć.","color":"Kolor","opacity":"Widoczność","copy":"Kopiuj","email_templates":{"title":"Szablony email","subject":"Temat","body":"Treść","none_selected":"Aby rozpocząć edycję, wybierz szablon wiadomości e-mail. ","revert":"Cofnij zmiany","revert_confirm":"Czy na pewno chcesz wycofać swoje zmiany?"},"css_html":{"title":"CSS, HTML","long_title":"Personalizacja kodu CSS i HTML"},"colors":{"title":"Kolory","long_title":"Schematy kolorów","about":"Zmień kolory strony bez modyfikacji CSS. Dodaj nowy schemat kolorów, aby rozpocząć.","new_name":"Nowy schemat kolorów","copy_name_prefix":"Kopia","delete_confirm":"Usunąć ten schemat kolorów?","undo":"cofnij","undo_title":"Cofnij zmiany tego koloru od ostatniego zapisu","revert":"przywróć","revert_title":"Zresetuj  ten kolor do wartości domyślnej.","primary":{"name":"podstawowy","description":"Większość tekstu, ikon oraz krawędzi."},"secondary":{"name":"drugorzędny","description":"Główny kolor tła oraz kolor tekstu niektórych przycisków."},"tertiary":{"name":"trzeciorzędny","description":"Linki, niektóre przyciski, powiadomienia oraz kolor używany w różnych akcentach."},"quaternary":{"name":"czwartorzędny","description":"Nawigacja"},"header_background":{"name":"tło nagłówka","description":"Kolor tła nagłówka witryny."},"header_primary":{"name":"podstawowy nagłówka","description":"Tekst oraz ikony w nagłówku witryny."},"highlight":{"name":"zaznacz","description":"Kolor tła podświetlonych/zaznaczonych elementów na stronie, takich jak wpisy i tematy."},"danger":{"name":"niebezpieczeństwo","description":"Kolor podświetlenia dla akcji takich jak usuwanie wpisów i tematów."},"success":{"name":"sukces","description":"Używany do oznaczania operacji zakończonych sukcesem."},"love":{"name":"polubienie","description":"Kolor przycisku polub"},"wiki":{"name":"wiki","description":"Kolor tła wpisów typu wiki."}}},"email":{"title":"Email","settings":"Ustawienia","all":"Wszystkie","sending_test":"Wysyłanie testowego emaila…","error":"\u003cb\u003eBŁAD\u003c/b\u003e - %{server_error}","test_error":"Wystąpił problem podczas wysyłania testowego maila. Sprawdź ustawienia poczty, sprawdź czy Twój serwer nie blokuje połączeń pocztowych i spróbuj ponownie.","sent":"Wysłane","skipped":"Pominięte","sent_at":"Wysłany na","time":"Czas","user":"Użytkownik","email_type":"Typ emaila","to_address":"Na adres","test_email_address":"adres email do testu","send_test":"Wyślij email testowy","sent_test":"wysłany!","delivery_method":"Metoda Dostarczenia","preview_digest":"Pokaż zestawienie aktywności","preview_digest_desc":"Podgląd treści zestawienia wysyłanego e-mailem do nieaktywnych użytkowników.","refresh":"Odśwież","format":"Format","html":"html","text":"text","last_seen_user":"Ostatnia ","reply_key":"Klucz odpowiedzi","skipped_reason":"Powód pominięcia","logs":{"none":"Nie znaleziono logów.","filters":{"title":"Filtr","user_placeholder":"nazwa użytkownika","address_placeholder":"nazwa@example.com","type_placeholder":"streszczenie, rejestracja…","reply_key_placeholder":"klucz odpowiedzi","skipped_reason_placeholder":"powód"}}},"logs":{"title":"Logi","action":"Działanie","created_at":"Utworzony","last_match_at":"Ostatnia Zgodność","match_count":"Zgodność","ip_address":"IP","topic_id":"ID tematu","post_id":"ID wpisu","category_id":"ID kategorii","delete":"Usuń","edit":"Edytuj","save":"Zapisz","screened_actions":{"block":"blok","do_nothing":"nic nie rób"},"staff_actions":{"title":"Działania obsługi","instructions":"Klikając nazwę użytkownika i akcję możesz filtrować listę. Kliknij awatary aby przejść na stronę użytkownika.","clear_filters":"Pokaż wszystko","staff_user":"Użytkownik obsługi","target_user":"Użytkownik będący Obiektem","subject":"Temat","when":"Kiedy","context":"Kontekst","details":"Szczegóły","previous_value":"Poprzedni","new_value":"Nowy","diff":"Różnice","show":"Pokaż","modal_title":"Szczegóły","no_previous":"Nie ma wcześniejszej wartości.","deleted":"Nie ma nowej wartości. Zapis został usunięty.","actions":{"delete_user":"usunięcie użytkownika","change_trust_level":"zmiana poziomu zaufania","change_username":"zmień nazwę użytkownika","change_site_setting":"zmiana ustawień serwisu","change_site_customization":"modyfikacja personalizacji serwisu","delete_site_customization":"usunięcie personalizacji strony","suspend_user":"zawieszenie użytkownika","unsuspend_user":"odwieszenie użytkownika","grant_badge":"przyznanie odznaki","revoke_badge":"odebranie odznaki","check_email":"sprawdzenie poczty","delete_topic":"usunięcie tematu","delete_post":"usunięcie wpisu","impersonate":"udawanie użytkownika","anonymize_user":"anonimizuj użytkownika","roll_up":"zwiń bloki IP","change_category_settings":"zmiana ustawień kategorii","delete_category":"Usuń kategorię","create_category":"Dodaj nową kategorię"}},"screened_emails":{"title":"Ekranowane emaile","description":"Kiedy ktoś próbuje założyć nowe konto, jego adres email zostaje sprawdzony i rejestracja zostaje zablokowana, lub inna akcja jest podejmowana.","email":"Adres email","actions":{"allow":"Zezwalaj"}},"screened_urls":{"title":"Ekranowane URLe","description":"URLe wypisane tutaj były używane we wpisach przez użytkowników wykrytych jako spamerzy.","url":"URL","domain":"Domena"},"screened_ips":{"title":"Ekranowane adresy IP","description":"Adres IP który teraz oglądasz. Użyj \"Zezwól\" aby dodać do białej listy adresów IP.","delete_confirm":"Czy na pewno chcesz usunąć regułę dla %{ip_address}?","roll_up_confirm":"Czy na pewno chcesz zgrupować monitorowane IP w podsieci?","rolled_up_some_subnets":"Pomyślnie zwinięto ban IP dla podsieci: %{subnets}.","rolled_up_no_subnet":"Brak pozycji do zwinięcia.","actions":{"block":"Zablokuj","do_nothing":"Zezwól","allow_admin":"Włącz dostęp do panelu admina"},"form":{"label":"Nowy:","ip_address":"Adres IP","add":"Dodaj","filter":"Wyszukaj"},"roll_up":{"text":"Zgrupuj","title":"Tworzy nowy ban dla podsieci jeśli jest co najmniej  'min_ban_entries_for_roll_up' pozycji."}},"logster":{"title":"Logi błędów"}},"impersonate":{"title":"Zaloguj się na to konto","help":"Użyj tego narzędzia, aby logować się jako dowolny użytkownik w celach diagnozy problemów.","not_found":"Wskazany użytkownik nie został znaleziony.","invalid":"Przepraszamy, nie możesz zalogować się jako ten użytkownik."},"users":{"title":"Użytkownicy","create":"Dodaj Administratora","last_emailed":"Ostatnio wysłano email","not_found":"Przepraszamu, taka nazwa użytkowanika nie istnieje w naszym systemie.","id_not_found":"Przepraszamy, ten identyfikator użytkownika nie istnieje w naszym systemie.","active":"Aktywny","show_emails":"Pokaż emaile","nav":{"new":"Nowi","active":"Aktywni","pending":"Oczekujący","staff":"Zespół","suspended":"Zawieszeni","blocked":"Zablokowani","suspect":"Podejrzani"},"approved":"Zatwierdzam?","approved_selected":{"one":"zatwierdź użytkownika","few":"zatwierdź użytkowników ({{count}})","other":"zatwierdź użytkowników ({{count}})"},"reject_selected":{"one":"odrzuć użytkownika(-czkę)","few":"odrzuć użytkowników ({{count}})","other":"odrzuć użytkowników ({{count}})"},"titles":{"active":"Aktywni użytkownicy","new":"Nowi użytkownicy","pending":"Użytkownicy oczekujący na akceptację","newuser":"Użytkownicy na 0 poziomie zaufania (Nowi)","basic":"Użytkownicy na 1 poziomie zaufania (Podstawowi)","member":"Użytkownicy na 2 poziomie zaufania (Zwyczajni)","regular":"Użytkownicy na 3 poziomie zaufania (Regularni)","leader":"Użytkownicy na 4 poziomie zaufania (Weterani)","staff":"Zespół","admins":"Administratorzy","moderators":"Moderatoratorzy","blocked":"Zablokowane konta","suspended":"Zawieszone konta","suspect":"Podejrzani użytkownicy"},"reject_successful":{"one":"Odrzucenie 1 użytkownika(-czki) powiodło się.","few":"Odrzucenie %{count} użytkowników powiodło się.","other":"Odrzucenie %{count} użytkowników powiodło się."},"reject_failures":{"one":"Odrzucenie 1 użytkownika(-czki) nie powiodło się.","few":"Odrzucenie %{count} użytkowników powiodło się.","other":"Odrzucenie %{count} użytkowników nie powiodło się."},"not_verified":"Niezweryfikowany","check_email":{"title":"Wyświetl adres email tego użytkownika","text":"Pokaż"}},"user":{"suspend_failed":"Coś poszło nie tak podczas zawieszania użytkownika {{error}}","unsuspend_failed":"Coś poszło nie tak podczas odwieszania użytkownika {{error}}","suspend_duration":"Jak długo użytkownik ma być zawieszony?","suspend_duration_units":"(dni)","suspend_reason_label":"Dlaczego zawieszasz? Ten tekst \u003cb\u003ebędzie widoczny dla wszystkich\u003c/b\u003e na stronie profilu użytkownika i będzie wyświetlany użytkownikowi gdy ten będzie próbował się zalogować. Zachowaj zwięzłość.","suspend_reason":"Powód","suspended_by":"Zawieszony przez","delete_all_posts":"Usuń wszystkie wpisy","delete_all_posts_confirm":"Zamierzasz usunąć %{posts} wpisów i %{topics} tematów. Czy na pewno?","suspend":"Zawieś","unsuspend":"Odwieś","suspended":"Zawieszony?","moderator":"Moderator?","admin":"Admin?","blocked":"Zablokowany?","show_admin_profile":"Admin","edit_title":"Edytuj tytuł","save_title":"Zapisz tytuł","refresh_browsers":"Wymuś odświeżenie przeglądarki","refresh_browsers_message":"Wiadomość wysłana do wszystkich klientów!","show_public_profile":"Pokaż profil publiczny","impersonate":"Zaloguj się na to konto","ip_lookup":"Wyszukiwanie IP","log_out":"Wyloguj","logged_out":"Użytkownik został wylogowany na wszystkich urządzeniach.","revoke_admin":"Odbierz status admina","grant_admin":"Przyznaj status admina","revoke_moderation":"Odbierz status moderatora","grant_moderation":"Przyznaj status moderatora","unblock":"Odblokuj","block":"Blokuj","reputation":"Reputacja","permissions":"Uprawnienia","activity":"Aktywność","like_count":"Polubień danych / otrzymanych","last_100_days":"w ostatnich 100 dniach","private_topics_count":"Prywatne tematy","posts_read_count":"Przeczytane wpisy","post_count":"Napisane wpisy","topics_entered":"Widziane tematy","flags_given_count":"Dane flagi","flags_received_count":"Otrzymane flagi","warnings_received_count":"Otrzymane ostrzeżenia","flags_given_received_count":"Flagi przyznane / otrzymane","approve":"Zatwierdź","approved_by":"zatwierdzone przez","approve_success":"Użytkownik zatwierdzony i został wysłany email z instrukcjami aktywacji.","approve_bulk_success":"Sukces! Wszyscy wybrani użytkownicy zostali zatwierdzeni i powiadomieni.","time_read":"Czas czytania","anonymize":"Anonimizacja użytkownika","anonymize_confirm":"Czy na pewno chcesz anonimizować to konto? Zmianie ulegnie nazwa użytkownika, e-mail oraz zawartość profilu.","anonymize_yes":"Tak, anonimizuj to konto.","anonymize_failed":"Wystąpił problem podczas anonimizacji konta.","delete":"Usuń użytkownika","delete_forbidden_because_staff":"Admini i moderatorzy nie mogą zostać usunięci.","delete_posts_forbidden_because_staff":"Nie można usunąć wszystkich wpisów administratorów i moderatorów.","delete_forbidden":{"one":"Użytkownik nie może zostać usunięty jeśli posiada wpisy. Usuń wszystkie jego wpisy przed usunięciem użytkownika. (Nie można usunąć wpisów starszych niż %{count} dzień.)","few":"Użytkownik nie może zostać usunięty jeśli posiada wpisy. Usuń wszystkie jego wpisy przed usunięciem użytkownika. (Nie można usunąć wpisów starszych niż %{count} dni.)","other":"Użytkownik nie może zostać usunięty jeśli posiada wpisy. Usuń wszystkie jego wpisy przed usunięciem użytkownika. (Nie można usunąć wpisów starszych niż %{count} dni.)"},"cant_delete_all_posts":{"one":"Nie można usunąć wszystkich postów. Część z nich ma więcej niż 1 dzień. (Ustawienie delete_user_max_post_age)","few":"Nie można usunąć wszystkich postów. Część z nich ma więcej niż %{count} dni. (Ustawienie delete_user_max_post_age)","other":"Nie można usunąć wszystkich wpisów. Część z nich ma więcej niż %{count} dni. (Ustawienie delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Nie można usunąć wszystkich postów, ponieważ użytkownik ma więcej niż 1 post. (delete_all_posts_max)","few":"Nie można usunąć wszystkich postów, ponieważ użytkownik ma ich więcej niż %{count}. (delete_all_posts_max)","other":"Nie można usunąć wszystkich wpisów, ponieważ użytkownik ma ich więcej niż %{count}. (delete_all_posts_max)"},"delete_confirm":"Czy NA PEWNO chcesz usunąć tego użytkownika? Będzie to nieodwracalne!","delete_and_block":"Usuń i \u003cb\u003ezablokuj\u003c/b\u003e ten email oraz adres IP","delete_dont_block":"Tylko usuń","deleted":"Użytkownik został usunięty.","delete_failed":"Wystąpił błąd podczas usuwania użytkownika. Upewnij się, że wszystkie wpisy zostały usunięte przed przystąpieniem do usuwania użytkownika.","send_activation_email":"Wyślij email aktywacyjny","activation_email_sent":"Email Aktywacyjny został wysłany.","send_activation_email_failed":"Wystąpił problem podczas wysyłania jeszcze jednego emaila aktywacyjnego. %{error}","activate":"Aktywuj Konto","activate_failed":"Wystąpił problem przy aktywacji konta użytkownika.","deactivate_account":"Deaktywuj konto","deactivate_failed":"Wystąpił problem przy deaktywacji konta użytkownika.","unblock_failed":"Wystąpił problem podczaj odblokowania użytkownika.","block_failed":"Wystąpił problem podczas blokowania użytkownika.","deactivate_explanation":"Wymusza ponowne potwierdzenie adresu email tego konta.","suspended_explanation":"Zawieszony użytkownik nie może się logować.","block_explanation":"Zablokowany użytkownik nie może tworzyć wpisów ani zaczynać tematów.","trust_level_change_failed":"Wystąpił problem przy zmianie poziomu zaufania użytkowanika.","suspend_modal_title":"Zawieś użytkownika","trust_level_2_users":"Użytkownicy o 2. poziomie zaufania","trust_level_3_requirements":"Wymagania 3. poziomu zaufania","trust_level_locked_tip":"poziom zaufania jest zablokowany, system nie będzie awansować lub degradować tego użytkownika","trust_level_unlocked_tip":"poziom zaufania jest odblokowany, system może awansować lub degradować tego użytkownika","lock_trust_level":"Zablokuj poziom zaufania","unlock_trust_level":"Odblokuj poziom zaufania","tl3_requirements":{"title":"Wymagania dla osiągnięcia 3. poziomu zaufania","table_title":"W ciągu ostatnich 100 dni:","value_heading":"Wartość","requirement_heading":"Wymaganie","visits":"Odwiedziny","days":"dni","topics_replied_to":"Tematy w odpowiedzi do","topics_viewed":"Wyświetlone Tematy","topics_viewed_all_time":"Oglądane Tematy (cały czas)","posts_read":"Przeczytane Wpisy","posts_read_all_time":"Przeczytane Wpisy (cały czas)","flagged_posts":"Zgłoszonych wpisów","flagged_by_users":"Flagujący Użytkownicy ","likes_given":"Polubień danych","likes_received":"Polubień otrzymanych","likes_received_days":"Otrzymane polubienia: unikalne dni","likes_received_users":"Otrzymane polubienia: od unikalnych użytkowników","qualifies":"Kwalifikuje się do 3 poziomu zaufania.","does_not_qualify":"Nie kwalifikuje się do 3 poziomu zaufania.","will_be_promoted":"Zostanie awansowany wkrótce.","will_be_demoted":"Zostanie zdegradowany wkrótce.","on_grace_period":"Podlega pod okres ochronny, nie zostanie zdegradowany.","locked_will_not_be_promoted":"Zablokowany poziom zaufania. Nie będzie awansować.","locked_will_not_be_demoted":"Zablokowany poziom zaufania. Nie będzie degradowany."},"sso":{"title":"Single Sign On","external_id":"Zewnętrzny ID","external_username":"Nazwa użytkownika","external_name":"Nazwa","external_email":"Email","external_avatar_url":"URL awatara"}},"user_fields":{"title":"Pola użytkownika","help":"Dodaj pola które użytkownicy mogą wypełnić.","create":"Dodaj pole użytkownika","untitled":"Bez tytułu","name":"Nazwa pola","type":"Typ pola","description":"Opis pola","save":"Zapisz","edit":"Edycja","delete":"Usuń","cancel":"Anuluj","delete_confirm":"Czy na pewno chcesz usunąć to pole?","options":"Opcje","required":{"title":"Wymagane przy rejestracji?","enabled":"wymagane","disabled":"niewymagane"},"editable":{"title":"Edytowalne po rejestracji?","enabled":"edytowalne","disabled":"nieedytowalne"},"show_on_profile":{"title":"Widoczne w publicznym profilu?","enabled":"widoczne w profilu","disabled":"niewidoczne w profilu"},"field_types":{"text":"Pole tekstowe","confirm":"Potwierdzenie","dropdown":"Lista rozwijana"}},"site_text":{"none":"Aby rozpocząć edycję, wybierz typ treści. ","title":"Kontekst"},"site_settings":{"show_overriden":"Pokaż tylko nadpisane","title":"Ustawienia","reset":"przywróć domyślne","none":"żadne","no_results":"Brak wyników wyszukiwania","clear_filter":"Wyczyść","add_url":"dodaj URL","add_host":"dodaj host","categories":{"all_results":"Wszystkie","required":"Wymagane","basic":"Podstawowe","users":"Użytkownicy","posting":"Pisanie","email":"Email","files":"Pliki","trust":"Poziomy zaufania","security":"Bezpieczeństwo","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Limity","developer":"Deweloperskie","embedding":"Osadzanie","legal":"Prawne","uncategorized":"Inne","backups":"Kopie zapasowe","login":"Logowanie","plugins":"Wtyczki","user_preferences":"Ustawienia użytk."}},"badges":{"title":"Odznaki","new_badge":"Nowa odznaka","new":"Nowa","name":"Nazwa","badge":"Odznaka","display_name":"Wyświetlana nazwa","description":"Opis","badge_type":"Typ odznaki","badge_grouping":"Grupa","badge_groupings":{"modal_title":"Grupy odznak"},"granted_by":"Przyznana przez","granted_at":"Przyznana","reason_help":"(Link do wpisu lub tematu)","save":"Zapisz","delete":"Usuń","delete_confirm":"Czy na pewno chcesz usunąć tę odznakę?","revoke":"Odbierz","reason":"Powód","expand":"Rozwiń \u0026hellip;","revoke_confirm":"Czy na pewno chcesz odebrać tę odznakę?","edit_badges":"Edytuj odznaki","grant_badge":"Przyznaj odznakę","granted_badges":"Przyznane odznaki","grant":"Przyznaj","no_user_badges":"%{name} nie otrzymał żadnych odznak.","no_badges":"Nie ma odznak, które można by było przyznać.","none_selected":"Wybierz odznakę, aby rozpocząć","allow_title":"Pozwól wykorzystywać odznakę jako tytuł","multiple_grant":"Może być przyznana wielokrotnie","listable":"Wyświetlaj odznakę na publicznych listach odznak","enabled":"Włącz odznakę","icon":"Ikona","image":"Grafika","icon_help":"Użyj jednej z klas Font Awesome lub adresu URL do grafiki","query":"Zapytanie odznaki (SQL) ","target_posts":"Wpisy powiązane z odznaką","auto_revoke":"Codziennie uruchamiaj zapytanie odbierające odznakę","show_posts":"Wyświetlaj wpisy odpowiedzialne za przyznanie odznaki na jej stronie ","trigger":"Aktywacja","trigger_type":{"none":"Automatycznie, raz dziennie","post_action":"Gdy użytkownik reaguje na wpis","post_revision":"Gdy użytkownik edytuje lub tworzy wpis","trust_level_change":"Gdy zmienia się poziom zaufania użytkownika","user_change":"Gdy użytkownik jest edytowany lub tworzony"},"preview":{"link_text":"Podgląd przyznanych odznak","plan_text":"Podgląd zapytania","modal_title":"Podgląd wykonania zapytania odznaki","sql_error_header":"Wystąpił błąd z zapytaniem","error_help":"Zapoznaj się z poniższymi linkami, aby uzyskać pomoc przy pisaniu zapytań dla odznak.","bad_count_warning":{"header":"UWAGA!","text":"Brakuje przykładowych wyników. Zapytanie odznaki zwraca nieistniejące ID użytkowników lub wpisów. Może to spowodować nieoczekiwane rezultaty w przyszłości – sprawdź ponownie swoje zapytanie. "},"no_grant_count":"Brak odznak do przyznania.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e odznaka do przyznania.","few":"\u003cb\u003e%{count}\u003c/b\u003e odznaki do przyznania.","other":"\u003cb\u003e%{count}\u003c/b\u003e odznak do przyznania."},"sample":"Podgląd:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e za wpis w %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e za wpis w %{link} o \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e o \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Dodawanie nowych emoji.  (PROTIP: przeciągnij i upuść wiele plików)","add":"Dodaj nowe Emoji","name":"Nazwa","image":"Grafika","delete_confirm":"Jesteś pewny(-a), że chcesz usunąć emoji :%{name}: ?"},"embedding":{"get_started":"Jeśli chcesz osadzić Discourse na innej stronie, rozpocznij podając jej host.","confirm_delete":"Czy na pewno chcesz usunąć ten host?","sample":"Użyj poniższego kodu HTML na swojej stronie, aby osadzić tematy z Discourse. Zastąp \u003cb\u003eREPLACE_ME\u003c/b\u003e domyślnym adresem URL strony na której osadzasz.","title":"Osadzanie","host":"Dozwolone hosty","edit":"edytuj","category":"Publikuj w kategorii","add_host":"Dodaj host","settings":"Ustawienia osadzania","feed_settings":"Ustawienia kanału","feed_description":"Wprowadzenie kanału RSS/ATOM twojego serwisu ułatwia import treści.","crawling_settings":"Ustawienia crawlera","crawling_description":"Gdy Discourse tworzy tematy reprezentujące twoje wpisy, a kanał RSS/ATOM nie został podany, treść będzie pobierana poprzez parsowanie HTML. Proces ten może okazać się trudny dlatego umożliwiamy podanie dodatkowych reguł CSS, które usprawniają proces parsowania.","embed_by_username":"Użytkownik tworzący tematy","embed_post_limit":"Maksymalna ilość osadzanych wpisów ","embed_username_key_from_feed":"Klucz używany do pobrania nazwy użytkownika z kanału","embed_truncate":"Skracaj treść osadzanych wpisów","embed_whitelist_selector":"Selektor CSS elementów jakie mogą być osadzane","embed_blacklist_selector":"Selektor CSS elementów jakie są usuwane podczas osadzania","feed_polling_enabled":"Importowanie wpisów via RSS/ATOM","feed_polling_url":"URL kanału RSS/ATOM","save":"Zapisz"},"permalink":{"title":"Permalinki","url":"URL","topic_id":"ID tematu","topic_title":"Temat","post_id":"ID wpisu","post_title":"Wpis","category_id":"ID kategorii","category_title":"Kategoria","external_url":"Zewnętrzny URL","delete_confirm":"Czy na pewno chcesz usunąć ten permalink?","form":{"label":"Nowy:","add":"Dodaj","filter":"Wyszukaj (URL or zewnętrzny URL)"}}},"lightbox":{"download":"pobierz"},"search_help":{"title":"Wyszukiwanie pomocy"},"keyboard_shortcuts_help":{"title":"Skróty klawiszowe","jump_to":{"title":"Skocz do","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Strona główna","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Aktualne","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nowe","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Nieprzeczytane","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategorie","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Popularne","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Zakładki","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Wiadomości"},"navigation":{"title":"Nawigacja","jump":"\u003cb\u003e#\u003c/b\u003e idź do wpisu #","back":"\u003cb\u003eu\u003c/b\u003e wstecz","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e zaznacz \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e lub \u003cb\u003eEnter\u003c/b\u003e otwórz wybrany temat","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e następna/poprzednia sekcja"},"application":{"title":"Aplikacja","create":"\u003cb\u003ec\u003c/b\u003e utwórz nowy temat","notifications":"\u003cb\u003en\u003c/b\u003e pokaż powiadomienia","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Otwórz menu","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e menu użytkownika","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e nowe zmiany w tematach","search":"\u003cb\u003e/\u003c/b\u003e wyszukaj","help":"\u003cb\u003e?\u003c/b\u003e skróty klawiszowe","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e wyczyść listę wpisów","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e wyczyść listę tematów","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Wylogowanie"},"actions":{"title":"Operacje","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e dodaj/usuń zakładkę na temat","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e przypnij/odepnij temat","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Udostępnij temat","share_post":"\u003cb\u003es\u003c/b\u003e udostępnij wpis","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e odpowiedz w nowym temacie","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Odpowiedz w temacie","reply_post":"\u003cb\u003er\u003c/b\u003e odpowiedz na wpis","quote_post":"\u003cb\u003eq\u003c/b\u003e cytuj wpis","like":"\u003cb\u003el\u003c/b\u003e polub wpis","flag":"\u003cb\u003e!\u003c/b\u003e oflaguj wpis","bookmark":"\u003cb\u003eb\u003c/b\u003e ustaw zakładkę na wpisie","edit":"\u003cb\u003ee\u003c/b\u003e edytuj wpis","delete":"\u003cb\u003ed\u003c/b\u003e usuń wpis","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e ucisz temat","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e zwykły (domyślny) temat","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e śledź temat","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e śledź wszystko w temacie"}},"badges":{"title":"Odznaki","allow_title":"może być użyta jako tytuł","multiple_grant":"może być przyznana wielokrotnie","badge_count":{"one":"1 odznaka","few":"%{count} odznaki","other":"%{count} odznak"},"more_badges":{"one":"+1 więcej","few":"+%{count} więcej","other":"+%{count} więcej"},"granted":{"one":"1 przyznane","few":"%{count} przyznanych","other":"%{count} przyznanych"},"select_badge_for_title":"Wybierz odznakę do użycia jako twój tytuł","none":"\u003cbrak\u003e","badge_grouping":{"getting_started":{"name":"Pierwsze kroki"},"community":{"name":"Społeczność"},"trust_level":{"name":"Poziom zaufania"},"other":{"name":"Inne"},"posting":{"name":"Wpisy"}},"badge":{"editor":{"name":"Edytor","description":"Pierwsza edycja"},"basic_user":{"name":"Podstawowy","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003ePrzyznano\u003c/a\u003e wszystkie podstawowe funkcje"},"member":{"name":"Zwykły","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003ePrzyznano\u003c/a\u003e zaproszenia"},"regular":{"name":"Regularny","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003ePrzyznano\u003c/a\u003e zmianę kategorii, tytułu, wyłączenie nofollow linków oraz Salon"},"leader":{"name":"Weteran","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003ePrzyznano\u003c/a\u003e możliwość edycji, przypinania, zamykania, archiwizacji, podziału i scalania"},"welcome":{"name":"Powitanie","description":"Otrzymano polubienie"},"autobiographer":{"name":"Autobiograf","description":"Wypełnienie \u003ca href=\"/my/preferences\"\u003eprofilu\u003c/a\u003e użytkownika"},"anniversary":{"name":"Rocznica","description":"Aktywność przez rok, co najmniej jeden wpis"},"nice_post":{"name":"Niezły wpis","description":"Otrzymano 10 polubień za wpis. Ta odznaka może być przyznawana wielokrotnie"},"good_post":{"name":"Dobry wpis","description":"Otrzymano 25 polubień za wpis. Ta odznaka może być przyznawana wielokrotnie"},"great_post":{"name":"Wspaniały wpis","description":"Otrzymano 50 polubień za wpis. Ta odznaka może być przyznawana wielokrotnie"},"nice_topic":{"name":"Niezły temat","description":"Otrzymano 10 polubień w temacie. Ta odznaka może być przyznawana wielokrotnie."},"good_topic":{"name":"Dobry temat","description":"Otrzymano 25 polubień w temacie. Ta odznaka może być przyznawana wielokrotnie."},"great_topic":{"name":"Świetny temat","description":"Otrzymano 50 polubień w temacie. Ta odznaka może być przyznawana wielokrotnie."},"nice_share":{"name":"Niezłe udostępnienie","description":"Udostępniono wpis 25 unikalnym odwiedzającym."},"good_share":{"name":"Dobre udostępnienie","description":"Udostępniono wpis 300 unikalnym odwiedzającym."},"great_share":{"name":"Świetne udostępnienie","description":"Udostępniono wpis 1000 unikalnych odwiedzających."},"first_like":{"name":"Pierwsze polubienie","description":"Polubiono wpis"},"first_flag":{"name":"Pierwsza flaga","description":"Zgłoszenie wpisu"},"promoter":{"name":"Promotor","description":"Zaproszenie użytkownika"},"campaigner":{"name":"Działacz","description":"Zaproszenie 3 użytkowników (poziom zaufania 1)"},"champion":{"name":"Czempion","description":"Zaproszenie 5 użytkowników (poziom zaufania 2)"},"first_share":{"name":"Pierwsze udostępnienie","description":"Udostępniono wpis"},"first_link":{"name":"Pierwszy link","description":"Dodano wewnętrzny link do innego tematu"},"first_quote":{"name":"Pierwszy cytat","description":"Zacytowano użytkownika"},"read_guidelines":{"name":"Przeczytany przewodnik","description":"Przeczytanie \u003ca href=\"/guidelines\"\u003ewytycznych społeczności\u003c/a\u003e"},"reader":{"name":"Czytelnik","description":"Przeczytanie każdego wpisu w temacie z ponad 100 wpisami"},"popular_link":{"name":"Popularny link","description":"Opublikowanie zewnętrznego linku, który otrzymał co najmniej 50 kliknięć"},"hot_link":{"name":"Gorący link","description":"Opublikowanie zewnętrznego linku, który otrzymał co najmniej 300 kliknięć"},"famous_link":{"name":"Słynny link","description":"Opublikowanie zewnętrznego linku, który otrzymał co najmniej 1000 kliknięć"}}},"google_search":"\u003ch3\u003eWyszukaj z Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","feature_topic":{"already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"}},"controls":"Topic Controls"},"category":{"contains_messages":"Change this category to only contain messages."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'pl_PL';
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
moment.fn.shortDate = function(){ return this.format('D MMM RRRR'); };
moment.fn.longDate = function(){ return this.format('D MMMM YYYY H:mm'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
