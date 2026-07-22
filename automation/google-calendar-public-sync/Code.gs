const CONFIG = Object.freeze({
  SOURCE_CALENDAR_ID: 'primary',
  PUBLIC_CALENDAR_NAME: '정동수 주요 일정',
  PUBLIC_PREFIX: '[공개]',
  TIME_ZONE: 'Asia/Seoul',
  PAST_DAYS: 30,
  FUTURE_DAYS: 365,
  SYNC_INTERVAL_MINUTES: 15,
  PROPERTY_PUBLIC_CALENDAR_ID: 'PUBLIC_CALENDAR_ID',
  TAG_SOURCE_KEY: 'stargateSourceKey',
  TAG_MANAGED: 'stargateManaged'
});

/**
 * One-time installer.
 * Creates/reuses the public calendar, installs a 15-minute trigger, and runs
 * the first sync. Run this while signed in as jds068888@gmail.com.
 */
function setupPublicCalendarSync() {
  const publicCalendar = getOrCreatePublicCalendar_();
  installTrigger_();
  syncPublicEvents();

  const id = publicCalendar.getId();
  const embedUrl =
    'https://calendar.google.com/calendar/embed?src=' +
    encodeURIComponent(id) +
    '&ctz=Asia%2FSeoul&mode=AGENDA';

  console.log('PUBLIC_CALENDAR_ID=' + id);
  console.log('EMBED_URL=' + embedUrl);
  return { calendarId: id, embedUrl: embedUrl };
}

/**
 * Copies only events whose title begins with [공개].
 * Deliberately copies only title and time. Attendees, descriptions, Google
 * Meet links, conferencing data, and source event visibility are excluded.
 */
function syncPublicEvents() {
  const sourceCalendar = CalendarApp.getCalendarById(CONFIG.SOURCE_CALENDAR_ID);
  if (!sourceCalendar) {
    throw new Error('원본 캘린더를 찾지 못했습니다: ' + CONFIG.SOURCE_CALENDAR_ID);
  }

  const publicCalendar = getOrCreatePublicCalendar_();
  const range = getSyncRange_();
  const sourceEvents = sourceCalendar
    .getEvents(range.start, range.end)
    .filter(isPublishable_);

  const destinationEvents = publicCalendar.getEvents(range.start, range.end);
  const destinationByKey = new Map();

  destinationEvents.forEach(event => {
    if (event.getTag(CONFIG.TAG_MANAGED) !== 'true') return;
    const key = event.getTag(CONFIG.TAG_SOURCE_KEY);
    if (key) destinationByKey.set(key, event);
  });

  const activeKeys = new Set();

  sourceEvents.forEach(sourceEvent => {
    const key = makeSourceKey_(sourceEvent);
    activeKeys.add(key);

    const publicTitle = stripPublicPrefix_(sourceEvent.getTitle());
    const existingEvent = destinationByKey.get(key);

    if (existingEvent) {
      updateDestinationEvent_(existingEvent, sourceEvent, publicTitle);
      return;
    }

    const createdEvent = createDestinationEvent_(
      publicCalendar,
      sourceEvent,
      publicTitle
    );
    createdEvent.setTag(CONFIG.TAG_MANAGED, 'true');
    createdEvent.setTag(CONFIG.TAG_SOURCE_KEY, key);
  });

  destinationEvents.forEach(event => {
    if (event.getTag(CONFIG.TAG_MANAGED) !== 'true') return;
    const key = event.getTag(CONFIG.TAG_SOURCE_KEY);
    if (key && !activeKeys.has(key)) event.deleteEvent();
  });

  console.log(
    '공개 일정 동기화 완료: ' +
      sourceEvents.length +
      '건 / ' +
      Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss')
  );
}

function isPublishable_(event) {
  return String(event.getTitle() || '').trim().startsWith(CONFIG.PUBLIC_PREFIX);
}

function stripPublicPrefix_(title) {
  const stripped = String(title || '')
    .trim()
    .slice(CONFIG.PUBLIC_PREFIX.length)
    .trim();
  return stripped || '공개 일정';
}

function makeSourceKey_(event) {
  const start = event.getStartTime().toISOString();
  return Utilities.base64EncodeWebSafe(event.getId() + '|' + start);
}

function createDestinationEvent_(calendar, sourceEvent, title) {
  if (sourceEvent.isAllDayEvent()) {
    return calendar.createAllDayEvent(
      title,
      sourceEvent.getAllDayStartDate(),
      sourceEvent.getAllDayEndDate(),
      { description: 'STARGATE 공개 일정 자동 동기화' }
    );
  }

  return calendar.createEvent(
    title,
    sourceEvent.getStartTime(),
    sourceEvent.getEndTime(),
    { description: 'STARGATE 공개 일정 자동 동기화' }
  );
}

function updateDestinationEvent_(destinationEvent, sourceEvent, title) {
  destinationEvent.setTitle(title);

  if (sourceEvent.isAllDayEvent()) {
    destinationEvent.setAllDayDates(
      sourceEvent.getAllDayStartDate(),
      sourceEvent.getAllDayEndDate()
    );
  } else {
    destinationEvent.setTime(
      sourceEvent.getStartTime(),
      sourceEvent.getEndTime()
    );
  }

  destinationEvent.setDescription('STARGATE 공개 일정 자동 동기화');
}

function getOrCreatePublicCalendar_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(CONFIG.PROPERTY_PUBLIC_CALENDAR_ID);

  if (savedId) {
    const savedCalendar = CalendarApp.getCalendarById(savedId);
    if (savedCalendar) return savedCalendar;
  }

  const namedCalendars = CalendarApp.getCalendarsByName(
    CONFIG.PUBLIC_CALENDAR_NAME
  );
  const calendar =
    namedCalendars.length > 0
      ? namedCalendars[0]
      : CalendarApp.createCalendar(CONFIG.PUBLIC_CALENDAR_NAME, {
          summary:
            'stargateedu.co.kr에 게시되는 정동수의 공개 일정 전용 캘린더',
          timeZone: CONFIG.TIME_ZONE
        });

  properties.setProperty(CONFIG.PROPERTY_PUBLIC_CALENDAR_ID, calendar.getId());
  return calendar;
}

function installTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncPublicEvents')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncPublicEvents')
    .timeBased()
    .everyMinutes(CONFIG.SYNC_INTERVAL_MINUTES)
    .create();
}

function getSyncRange_() {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  start.setDate(start.getDate() - CONFIG.PAST_DAYS);
  end.setDate(end.getDate() + CONFIG.FUTURE_DAYS);
  return { start: start, end: end };
}
