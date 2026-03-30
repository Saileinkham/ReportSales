import ReactECharts from 'echarts-for-react'
import { aggregateKpi, groupAggregate, formatNumber, dateLabel } from '../lib/analytics.js'

function getColType(columns, field) {
  return columns.find((c) => c.field === field)?.type || 'string'
}

export default function WidgetRenderer({ widget, rows, columns }) {
  if (!widget) return null

  if (widget.type === 'kpi') {
    const value = aggregateKpi(rows, { agg: widget.config.agg, field: widget.config.measureField })
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {widget.config.agg?.toUpperCase?.() || 'SUM'}
        </div>
        <div className="mt-2 text-4xl font-bold text-gray-900">
          {formatNumber(value, widget.config.format)}
        </div>
      </div>
    )
  }

  if (widget.type === 'table') {
    const fields = widget.config.fields?.length ? widget.config.fields : columns.filter((c) => !c.hidden).slice(0, 8).map((c) => c.field)
    const limit = Number.isFinite(widget.config.limit) ? widget.config.limit : 50
    const shown = rows.slice(0, limit)
    return (
      <div className="h-full overflow-auto rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {fields.map((f) => (
                <th key={f} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {columns.find((c) => c.field === f)?.label || f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {shown.map((r, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {fields.map((f) => (
                  <td key={f} className="px-3 py-2 text-gray-700">
                    {(() => {
                      const v = r?.[f]
                      if (v === null || v === undefined) return '-'
                      const t = getColType(columns, f)
                      if (t === 'number') return formatNumber(v, 'number')
                      if (t === 'date') return dateLabel(v)
                      return String(v)
                    })()}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={fields.length || 1} className="px-3 py-8 text-center text-gray-400">
                  ไม่มีข้อมูล
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    )
  }

  if (widget.type === 'bar' || widget.type === 'line') {
    const items = groupAggregate(rows, {
      dimensionField: widget.config.dimensionField,
      measureField: widget.config.measureField,
      agg: widget.config.agg,
      limit: widget.config.limit,
      sort: widget.config.sort,
    })

    const dimType = getColType(columns, widget.config.dimensionField)
    const names = items.map((x) => (dimType === 'date' ? dateLabel(x.name) : x.name))
    const values = items.map((x) => x.value)

    const option = {
      grid: { left: 40, right: 16, top: 16, bottom: 50 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { rotate: names.length > 10 ? 30 : 0 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: widget.type,
          data: values,
          smooth: widget.type === 'line',
          itemStyle: { color: '#2563eb' },
          areaStyle: widget.type === 'line' ? { opacity: 0.08 } : undefined,
        },
      ],
    }

    return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      ยังไม่รองรับ widget ประเภทนี้
    </div>
  )
}
