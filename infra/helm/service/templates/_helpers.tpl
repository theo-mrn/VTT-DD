{{- define "svc.name" -}}
{{- default .Release.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "svc.labels" -}}
app.kubernetes.io/name: {{ include "svc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: vtt
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "svc.selector" -}}
app.kubernetes.io/name: {{ include "svc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "svc.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}
{{- end -}}

{{- /* Règles de l'Ingress, communes à l'accès direct et au tunnel */}}
{{- define "svc.ingressRules" -}}
- host: {{ .Values.ingress.host | quote }}
  http:
    paths:
      {{- /* Chemins confiés à un autre service du namespace (ex. /v1 → gateway) */}}
      {{- range .Values.ingress.extraPaths }}
      - path: {{ .path }}
        pathType: Prefix
        backend:
          service:
            name: {{ .service }}
            port: { name: http }
      {{- end }}
      - path: {{ .Values.ingress.path }}
        pathType: Prefix
        backend:
          service:
            name: {{ include "svc.name" . }}
            port: { name: http }
{{- end -}}
