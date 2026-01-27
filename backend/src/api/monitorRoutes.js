/**
 * Monitor Routes
 * REST API endpoints for compositional algorithm monitoring
 *
 * All routes are protected by adminAuth middleware
 * Access via /api/admin/monitor/* with X-Admin-Key header
 */

const express = require('express')
const router = express.Router()

/**
 * Create monitor routes
 * @param {CompositionMonitor} compositionMonitor - CompositionMonitor instance
 * @returns {Router} Express router
 */
function createMonitorRoutes(compositionMonitor) {
  /**
   * GET /api/admin/monitor/realtime
   * Get current real-time state + recent snapshots
   */
  router.get('/realtime', (req, res) => {
    try {
      const state = compositionMonitor.getRealtimeState()
      res.json({
        success: true,
        ...state,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'realtime_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/stats/daily
   * Get 24-hour statistics
   */
  router.get('/stats/daily', (req, res) => {
    try {
      const stats = compositionMonitor.getDailyStats()
      res.json({
        success: true,
        ...stats,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'daily_stats_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/stats/hourly
   * Get hourly breakdown
   * Query params: hours (default: 24)
   */
  router.get('/stats/hourly', (req, res) => {
    try {
      const hours = Math.min(48, parseInt(req.query.hours) || 24)
      const stats = compositionMonitor.getHourlyStats(hours)
      res.json({
        success: true,
        ...stats,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'hourly_stats_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/rooms/:roomId
   * Get room-specific composition history
   * Query params: limit (default: 50)
   */
  router.get('/rooms/:roomId', (req, res) => {
    try {
      const { roomId } = req.params
      const limit = Math.min(200, parseInt(req.query.limit) || 50)
      const history = compositionMonitor.getRoomHistory(roomId, limit)
      res.json({
        success: true,
        ...history,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'room_history_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/history/numeric
   * Get 5-minute history for all numeric fields (for linear graphs)
   */
  router.get('/history/numeric', (req, res) => {
    try {
      const history = compositionMonitor.getNumericHistory()
      res.json({
        success: true,
        ...history,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'numeric_history_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/history/:fieldPath
   * Get 5-minute history for a specific field
   * Example: /api/admin/monitor/history/core.tempo
   */
  router.get('/history/:fieldPath', (req, res) => {
    try {
      const { fieldPath } = req.params
      const history = compositionMonitor.getFieldHistory(fieldPath)
      res.json({
        success: true,
        ...history,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'field_history_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/reports
   * List available report files with metadata
   */
  router.get('/reports', (req, res) => {
    try {
      const reports = compositionMonitor.listReportFiles()
      res.json({
        success: true,
        ...reports,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'list_reports_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/reports/:date
   * Get report data for a specific date
   * Query params:
   *   - limit: max entries (default: 1000)
   *   - aggregate: include aggregated stats (default: true)
   */
  router.get('/reports/:date', (req, res) => {
    try {
      const { date } = req.params
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'invalid_date_format',
          message: 'Date must be in YYYY-MM-DD format'
        })
      }

      const limit = Math.min(5000, parseInt(req.query.limit) || 1000)
      const aggregate = req.query.aggregate !== 'false'

      const report = compositionMonitor.getReportByDate(date, { limit, aggregate })
      res.json({
        success: true,
        ...report,
        timestamp: Date.now()
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'get_report_error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/monitor/status
   * Get monitor status and configuration
   */
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      enabled: process.env.COMPOSITION_MONITOR === 'true',
      config: {
        bufferSize: 100,
        flushInterval: 5000,
        historyDuration: compositionMonitor.historyDuration,
        historyBroadcastInterval: compositionMonitor.historyBroadcastInterval,
        persistenceEnabled: true
      },
      timestamp: Date.now()
    })
  })

  return router
}

module.exports = { createMonitorRoutes }
