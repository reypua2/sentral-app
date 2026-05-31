"""
Sentralis — Google Sheets Data Foundation Setup Script
Session 003 · Rey & Claude · MCPro · Cebu City, Philippines

Run this ONCE. It will:
1. Authenticate with your Google account (browser will open)
2. Create the Sentralis-Data spreadsheet
3. Build all 8 tabs with correct column headers
4. Insert seed data (Rey's contexts and sample events)
5. Print the Sheet ID you need for the app

After running, paste the Sheet ID back to Claude.
"""

import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# ─── SCOPES ──────────────────────────────────────────────────────────────────
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]

# ─── AUTH ─────────────────────────────────────────────────────────────────────
def authenticate():
    creds = None
    token_path = 'token.json'
    creds_path = 'credentials.json'

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(creds_path):
                print("ERROR: credentials.json not found in this folder.")
                print("Make sure credentials.json is in: D:\\=Documents\\github\\sentral-app\\")
                exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    return creds

# ─── SHEET DEFINITIONS ────────────────────────────────────────────────────────

SHEETS = {
    'Events': {
        'headers': [
            'event_id', 'date', 'time', 'title', 'context',
            'context_color', 'priority', 'detail', 'location',
            'status', 'conflict', 'needs_approval', 'approved_by',
            'created_at', 'updated_at'
        ],
        'rows': [
            ['EVT001', '2026-05-11', '06:00', 'Morning Prayer & Devotional', 'Family',
             '#4ADE80', 'light', 'Personal scripture study before the household wakes', 'Home',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT002', '2026-05-11', '07:30', 'Ward Bishopric Meeting', 'Church',
             '#F5C842', 'normal', '2nd Counselor + Exec. Secretary · Chapel, Rm 3', 'Chapel Room 3',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT003', '2026-05-11', '09:00', 'City Council — Budget Review', 'Mayor',
             '#FF3B3B', 'critical', 'FY2026 Infrastructure allocation · City Hall, Session Room', 'City Hall',
             'active', 'TRUE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT004', '2026-05-11', '09:30', 'MCPro Client Discovery Call', 'MCPro',
             '#3B82F6', 'important', 'Onboarding — Davao wholesale prospect', 'Virtual',
             'active', 'TRUE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT005', '2026-05-11', '12:00', 'Lunch — Home', 'Family',
             '#4ADE80', 'light', 'Family meal if schedule allows', 'Home',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT006', '2026-05-11', '14:00', 'Hardware Store — Supplier Meeting', 'Hardware',
             '#FF8C00', 'important', 'Quarterly inventory review · SM Cebu supplier', 'SM Cebu',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT007', '2026-05-11', '16:00', 'Youth Activity — Approval Needed', 'Church',
             '#F5C842', 'normal', 'Youth committee requesting activity budget PHP 3,500', 'Chapel',
             'active', 'FALSE', 'TRUE', '', '2026-05-11', '2026-05-11'],
            ['EVT008', '2026-05-11', '19:00', 'Family Dinner + Homework Time', 'Family',
             '#4ADE80', 'light', 'Kids: Miguel, Ana, Jose, Lucia, Bea · check assignments', 'Home',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
            ['EVT009', '2026-05-11', '21:00', 'Sentralis Dev Session', 'MCPro',
             '#3B82F6', 'important', 'Continue building with Claude — next: Money module', 'Home Office',
             'active', 'FALSE', 'FALSE', '', '2026-05-11', '2026-05-11'],
        ]
    },

    'People': {
        'headers': [
            'person_id', 'name', 'nickname', 'context', 'role',
            'phone', 'email', 'birthday', 'address',
            'notes', 'priority', 'last_contact', 'created_at'
        ],
        'rows': [
            ['PEO001', 'Rey Wife', '', 'Family', 'Spouse',
             '', '', '', 'Cebu City',
             'Shared app access', 'critical', '', '2026-05-11'],
            ['PEO002', 'Miguel', '', 'Family', 'Child',
             '', '', '', 'Home',
             'Eldest child', 'critical', '', '2026-05-11'],
            ['PEO003', 'Ana', '', 'Family', 'Child',
             '', '', '', 'Home',
             '', 'critical', '', '2026-05-11'],
            ['PEO004', 'Jose', '', 'Family', 'Child',
             '', '', '', 'Home',
             '', 'critical', '', '2026-05-11'],
            ['PEO005', 'Lucia', '', 'Family', 'Child',
             '', '', '', 'Home',
             '', 'critical', '', '2026-05-11'],
            ['PEO006', 'Bea', '', 'Family', 'Child',
             '', '', '', 'Home',
             'Youngest', 'critical', '', '2026-05-11'],
        ]
    },

    'Tasks': {
        'headers': [
            'task_id', 'title', 'context', 'priority', 'status',
            'due_date', 'assigned_to', 'detail', 'created_at', 'completed_at'
        ],
        'rows': [
            ['TSK001', 'Approve Youth Activity Budget PHP 3,500', 'Church', 'normal', 'pending',
             '2026-05-11', 'Rey', 'Youth committee requesting budget for activity', '2026-05-11', ''],
            ['TSK002', 'Follow up Davao MCPro Prospect', 'MCPro', 'important', 'pending',
             '2026-05-12', 'Rey', 'Send proposal after discovery call', '2026-05-11', ''],
            ['TSK003', 'Review FY2026 Infrastructure Budget', 'Mayor', 'critical', 'in-progress',
             '2026-05-11', 'Rey', 'City Council budget review session', '2026-05-11', ''],
        ]
    },

    'Money': {
        'headers': [
            'money_id', 'date', 'type', 'amount', 'currency',
            'context', 'category', 'description', 'account',
            'receipt_url', 'created_at'
        ],
        'rows': [
            ['MON001', '2026-05-11', 'expense', '3500', 'PHP',
             'Church', 'Activity Budget', 'Youth activity budget — pending approval', 'Church Fund',
             '', '2026-05-11'],
        ]
    },

    'Notes': {
        'headers': [
            'note_id', 'title', 'context', 'content',
            'tags', 'priority', 'created_at', 'updated_at'
        ],
        'rows': [
            ['NOT001', 'Sentralis Build Notes', 'MCPro',
             'Session 003 — Google Sheets data foundation complete. Next: wire app to live data.',
             'sentralis,build,session003', 'important', '2026-05-11', '2026-05-11'],
        ]
    },

    'Comms': {
        'headers': [
            'comm_id', 'date', 'type', 'direction', 'contact',
            'context', 'summary', 'follow_up_needed', 'follow_up_date', 'created_at'
        ],
        'rows': [
            ['COM001', '2026-05-11', 'call', 'outbound', 'Davao Prospect',
             'MCPro', 'Discovery call — discuss AI automation needs', 'TRUE', '2026-05-12', '2026-05-11'],
        ]
    },

    'Analytics': {
        'headers': [
            'analytics_id', 'date', 'context', 'metric_name',
            'metric_value', 'unit', 'notes', 'created_at'
        ],
        'rows': [
            ['ANL001', '2026-05-11', 'MCPro', 'Active Prospects',
             '1', 'count', 'Davao wholesale prospect from discovery call', '2026-05-11'],
            ['ANL002', '2026-05-11', 'Hardware', 'Supplier Meetings This Quarter',
             '1', 'count', 'SM Cebu supplier quarterly review', '2026-05-11'],
        ]
    },

    'Config': {
        'headers': [
            'config_key', 'config_value', 'description', 'updated_at'
        ],
        'rows': [
            ['owner_name', 'Reynaldo Jr.', 'Primary user full name', '2026-05-11'],
            ['owner_nickname', 'Rey', 'Display name in app', '2026-05-11'],
            ['owner_location', 'Cebu City, Philippines', 'Home base location', '2026-05-11'],
            ['app_version', '0.2', 'Current Sentralis version', '2026-05-11'],
            ['context_1', 'Family', 'Personal family context', '2026-05-11'],
            ['context_2', 'Church', 'LDS Ward Bishop calling', '2026-05-11'],
            ['context_3', 'Mayor', 'City Government political position', '2026-05-11'],
            ['context_4', 'MCPro', 'MCPro Solutions AI automation business', '2026-05-11'],
            ['context_5', 'Hardware', 'Hardware Store business', '2026-05-11'],
            ['context_6', 'Foundation', 'Humanitarian Foundation civic role', '2026-05-11'],
            ['context_7', 'Printing', 'Printing Consultant professional role', '2026-05-11'],
            ['color_family', '#4ADE80', 'Context color for Family', '2026-05-11'],
            ['color_church', '#F5C842', 'Context color for Church', '2026-05-11'],
            ['color_mayor', '#FF3B3B', 'Context color for Mayor', '2026-05-11'],
            ['color_mcpro', '#3B82F6', 'Context color for MCPro', '2026-05-11'],
            ['color_hardware', '#FF8C00', 'Context color for Hardware', '2026-05-11'],
            ['sheets_version', '1.0', 'Data schema version', '2026-05-11'],
        ]
    },
}

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  SENTRALIS — Google Sheets Data Foundation Setup")
    print("  Session 003 · MCPro · Cebu City, Philippines")
    print("=" * 60)
    print()
    print("Step 1: Authenticating with Google...")
    print("  → A browser window will open. Sign in with your Gmail.")
    print("  → Click Allow when Google asks for permission.")
    print()

    creds = authenticate()
    service = build('sheets', 'v4', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)

    print("✓ Authentication successful!")
    print()
    print("Step 2: Creating Sentralis-Data spreadsheet...")

    # Create the spreadsheet with all 8 sheets
    sheet_requests = []
    for i, sheet_name in enumerate(SHEETS.keys()):
        sheet_requests.append({
            'addSheet': {
                'properties': {
                    'title': sheet_name,
                    'index': i,
                    'gridProperties': {
                        'frozenRowCount': 1,  # Freeze header row
                    }
                }
            }
        })

    spreadsheet_body = {
        'properties': {
            'title': 'Sentralis-Data',
        },
        'sheets': [
            {'properties': {'title': name, 'gridProperties': {'frozenRowCount': 1}}}
            for name in SHEETS.keys()
        ]
    }

    spreadsheet = service.spreadsheets().create(body=spreadsheet_body).execute()
    sheet_id = spreadsheet['spreadsheetId']

    print(f"✓ Spreadsheet created!")
    print()
    print("Step 3: Building all 8 tabs with headers and seed data...")

    # Write headers and data to each sheet
    data_to_write = []
    for sheet_name, sheet_def in SHEETS.items():
        all_rows = [sheet_def['headers']] + sheet_def['rows']
        data_to_write.append({
            'range': f"{sheet_name}!A1",
            'values': all_rows
        })

    body = {
        'valueInputOption': 'RAW',
        'data': data_to_write
    }

    service.spreadsheets().values().batchUpdate(
        spreadsheetId=sheet_id,
        body=body
    ).execute()

    print("✓ All 8 tabs built:")
    for sheet_name, sheet_def in SHEETS.items():
        row_count = len(sheet_def['rows'])
        col_count = len(sheet_def['headers'])
        print(f"   • {sheet_name:<12} — {col_count} columns, {row_count} data rows")

    print()
    print("Step 4: Formatting header rows...")

    # Bold and color the header rows
    sheet_ids = {
        sheet['properties']['title']: sheet['properties']['sheetId']
        for sheet in spreadsheet['sheets']
    }

    format_requests = []
    for sheet_name, gsheet_id in sheet_ids.items():
        format_requests.append({
            'repeatCell': {
                'range': {
                    'sheetId': gsheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.04, 'green': 0.05, 'blue': 0.06},
                        'textFormat': {
                            'bold': True,
                            'foregroundColor': {'red': 0.94, 'green': 0.95, 'blue': 0.96},
                            'fontSize': 10,
                        }
                    }
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat)'
            }
        })
        # Auto-resize columns
        format_requests.append({
            'autoResizeDimensions': {
                'dimensions': {
                    'sheetId': gsheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 0,
                    'endIndex': len(SHEETS[sheet_name]['headers'])
                }
            }
        })

    service.spreadsheets().batchUpdate(
        spreadsheetId=sheet_id,
        body={'requests': format_requests}
    ).execute()

    print("✓ Headers formatted and columns auto-sized")
    print()
    print("=" * 60)
    print("  ✓ SENTRALIS-DATA SPREADSHEET READY")
    print("=" * 60)
    print()
    print(f"  Sheet ID: {sheet_id}")
    print()
    print(f"  Open your sheet here:")
    print(f"  https://docs.google.com/spreadsheets/d/{sheet_id}/edit")
    print()
    print("  → Copy the Sheet ID above and paste it to Claude.")
    print("  → Claude will use it to wire the app to your live data.")
    print()
    print("  Save this ID somewhere safe:")
    print(f"  {sheet_id}")
    print()

    # Save sheet ID to a local file for easy reference
    with open('sentralis_sheet_id.txt', 'w') as f:
        f.write(f"Sentralis-Data Sheet ID\n")
        f.write(f"Generated: 2026-05-11\n\n")
        f.write(f"Sheet ID: {sheet_id}\n\n")
        f.write(f"URL: https://docs.google.com/spreadsheets/d/{sheet_id}/edit\n")

    print("  ✓ Sheet ID also saved to: sentralis_sheet_id.txt")
    print()

if __name__ == '__main__':
    main()
