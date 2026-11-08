'use strict';

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const KB_PER_GB = 1024 * 1024; // /proc/meminfo values are in KiB (1024 bytes)

var MemoryReader = class MemoryReader {
    read() {
        try {
            const [ok, contents] = GLib.file_get_contents('/proc/meminfo');
            if (!ok || !contents)
                return null;

            const text = ByteArray.toString(contents);
            const lines = text.split('\n');
            const info = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line)
                    continue;
                const colonIdx = line.indexOf(':');
                if (colonIdx === -1)
                    continue;

                const key = line.substring(0, colonIdx).trim();
                if (
                    key === 'MemTotal' ||
                    key === 'MemFree' ||
                    key === 'MemAvailable' ||
                    key === 'Buffers' ||
                    key === 'Cached' ||
                    key === 'SReclaimable' ||
                    key === 'SwapTotal' ||
                    key === 'SwapFree'
                ) {
                    const rest = line.substring(colonIdx + 1).trim();
                    const val = parseInt(rest, 10);
                    if (!isNaN(val))
                        info[key] = val;
                }
            }

            const memTotalKiB = info.MemTotal || 0;
            const memAvailableKiB =
                info.MemAvailable !== undefined
                    ? info.MemAvailable
                    : (info.MemFree || 0) + (info.Buffers || 0) + (info.Cached || 0);

            const memUsedKiB = Math.max(0, memTotalKiB - memAvailableKiB);
            const ramPercent =
                memTotalKiB > 0 ? Math.round((memUsedKiB / memTotalKiB) * 100) : 0;

            const swapTotalKiB = info.SwapTotal || 0;
            const swapFreeKiB = info.SwapFree || 0;
            const swapUsedKiB = Math.max(0, swapTotalKiB - swapFreeKiB);
            const swapPercent =
                swapTotalKiB > 0 ? Math.round((swapUsedKiB / swapTotalKiB) * 100) : 0;

            const ramUsedGB = (memUsedKiB / KB_PER_GB).toFixed(1);
            const ramFreeGB = (memAvailableKiB / KB_PER_GB).toFixed(1);
            const ramTotalGB = (memTotalKiB / KB_PER_GB).toFixed(1);
            const swapUsedGB = (swapUsedKiB / KB_PER_GB).toFixed(1);
            const swapFreeGB = (swapFreeKiB / KB_PER_GB).toFixed(1);
            const swapTotalGB = (swapTotalKiB / KB_PER_GB).toFixed(1);

            return {
                ramUsedKiB: memUsedKiB,
                ramFreeKiB: memAvailableKiB,
                ramTotalKiB: memTotalKiB,
                ramUsedGB,
                ramFreeGB,
                ramTotalGB,
                ramPercent,
                swapUsedKiB,
                swapFreeKiB,
                swapTotalKiB,
                swapUsedGB,
                swapFreeGB,
                swapTotalGB,
                swapPercent,
                hasSwap: swapTotalKiB > 0,
            };
        } catch (e) {
            logError(e, 'MemoryHUD: Failed to read /proc/meminfo');
            return null;
        }
    }
};
