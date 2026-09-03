import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("purge journeys after their 30-day recovery period", { hourUTC: 2, minuteUTC: 15 }, internal.trips.purgeExpiredDeleted);

export default crons;
