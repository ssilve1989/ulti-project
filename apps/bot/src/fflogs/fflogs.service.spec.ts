import { beforeEach, describe, expect, test, vi } from 'vitest';
import { expiredReportError } from './fflogs.consts.js';
import { FFLogsService } from './fflogs.service.js';

describe('FFLogsService', () => {
  let service: FFLogsService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      reportData: vi.fn(),
      encounterRankings: vi.fn(),
    };
    service = new FFLogsService(mockClient);
  });

  describe('validateReportAge', () => {
    test('should return valid for report within 28 days', async () => {
      const recentDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 15,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: recentDate,
            endTime: recentDate + 1000000,
            title: 'Test Report',
          },
        },
      });

      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(true);
      expect(result.reportDate).toEqual(new Date(recentDate + 1000000));
      expect(result.errorMessage).toBeUndefined();
    });

    test('should return invalid for report older than 28 days', async () => {
      const oldDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 35,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: oldDate,
            endTime: oldDate + 1000000,
            title: 'Old Report',
          },
        },
      });

      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe(expiredReportError(35, 28));
      expect(result.reportDate).toEqual(new Date(oldDate + 1000000));
    });

    test('should return invalid for non-existent report', async () => {
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: null,
        },
      });

      const result = await service.validateReportAge('NONEXISTENT');

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Report not found');
    });

    test('should handle API errors gracefully', async () => {
      mockClient.reportData.mockRejectedValue(new Error('API Error'));

      const loggerSpy = vi
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => {});
      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(true); // Should allow signup to proceed
      expect(result.errorMessage).toContain(
        'Unable to validate report age due to API issues',
      );
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(String));

      loggerSpy.mockRestore();
    });

    test('should use custom max age days', async () => {
      const testDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 40,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: testDate,
            endTime: testDate + 1000000,
            title: 'Test Report',
          },
        },
      });

      const result = await service.validateReportAge('ABC123', 50); // Allow 50 days

      expect(result.isValid).toBe(true);
    });

    test('should handle report exactly at boundary', async () => {
      const boundaryDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 28,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: boundaryDate,
            endTime: boundaryDate + 1000000,
            title: 'Boundary Report',
          },
        },
      });

      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(true);
    });

    test('should handle report just over boundary', async () => {
      const overBoundaryDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 29,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: overBoundaryDate,
            endTime: overBoundaryDate + 1000000,
            title: 'Over Boundary Report',
          },
        },
      });

      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe(expiredReportError(29, 28));
    });

    test('should handle concurrent validation requests', async () => {
      const recentDate = Temporal.Now.zonedDateTimeISO().subtract({
        days: 15,
      }).epochMilliseconds;
      mockClient.reportData.mockResolvedValue({
        reportData: {
          report: {
            code: 'ABC123',
            startTime: recentDate,
            endTime: recentDate + 1000000,
            title: 'Test Report',
          },
        },
      });

      // Make multiple concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => service.validateReportAge('ABC123'));

      const results = await Promise.all(promises);

      // All should succeed
      // biome-ignore lint/complexity/noForEach: test file
      results.forEach((result) => {
        expect(result.isValid).toBe(true);
      });

      // Should have made 5 API calls
      expect(mockClient.reportData).toHaveBeenCalledTimes(5);
    });

    test('should handle network timeout gracefully', async () => {
      mockClient.reportData.mockRejectedValue(new Error('Network timeout'));

      const loggerSpy = vi
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => {});
      const result = await service.validateReportAge('ABC123');

      expect(result.isValid).toBe(true); // Should allow signup to proceed
      expect(result.errorMessage).toContain(
        'Unable to validate report age due to API issues',
      );
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(String));

      loggerSpy.mockRestore();
    });
  });
});
