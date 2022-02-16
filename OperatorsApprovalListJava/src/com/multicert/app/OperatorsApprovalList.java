package com.multicert.app;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

public class OperatorsApprovalList {

	private static String LOGO_B64;
	
	private static final String[] MONTHS = new String[] {
			"Janeiro",
			"Fevereiro",
			"Março",
			"Abril",
			"Maio",
			"Junho",
			"Julho",
			"Agosto",
			"Setembro",
			"Outubro",
			"Novembro",
			"Dezembro"
	};
	
	static {
		try {
			FileInputStream fis = new FileInputStream(new File("data/logo.png"));
			ByteArrayOutputStream baos = new ByteArrayOutputStream();
			byte[] buffer = new byte[4096];
			
			while(fis.read(buffer) > 0) {
				baos.write(buffer);
			}
			fis.close();
			LOGO_B64 = new String(Base64.getEncoder().encode(baos.toByteArray()), "UTF-8");
		} catch(Exception e) {
			System.err.println(e.getMessage());
			e.printStackTrace();
			System.exit(-1);
		}
	}

	public static void main(String[] args) throws Exception {
		Map<String, String> users = loadUsers();

		//clearOutputDirectory(args[1]);
		processLogs(args[0], args[1], users);
		addTrail(args[1], users);
	}

	protected static void processLogs(String dirIn, String dirOut, Map<String, String> users) throws Exception {
		File logsDir = new File(dirIn);
		File[] logFiles = logsDir.listFiles();
		FileInputStream fis;
		GZIPInputStream gzis;
		InputStreamReader reader;
		BufferedReader in;
		String logLine;
		Pattern filePattern = Pattern.compile(".*-(\\d+)\\.(\\d+)\\.(\\d+)\\.gz");
		Pattern logPattern = Pattern.compile("^.*(\\d\\d:\\d\\d:\\d\\d),\\d\\d\\d.+User: (\\p{Print}+) approved documentation for refMtc: (MTC\\d+)");
		Matcher m;
		String year, month, day;
		String time, username, name, ref;
		boolean isNewFile;
		File fOut;
		FileOutputStream fos;
		OutputStreamWriter ows;

		Arrays.sort(logFiles);

		for(int i = 0; i < logFiles.length; i++) {
			if(logFiles[i].isFile()) {
				System.out.println("Processing file " + logFiles[i]);
				m = filePattern.matcher(logFiles[i].getName());
				if(m.matches()) {
					year = m.group(1);
					month = m.group(2);
					day = m.group(3);
					fis = new FileInputStream(logFiles[i]);
					gzis = new GZIPInputStream(fis);
					reader = new InputStreamReader(gzis);
					in = new BufferedReader(reader);
		
					while((logLine = in.readLine()) != null) {
						m = logPattern.matcher(logLine);
						if(m.matches()) {
							time = m.group(1);
							username = m.group(2);
							name = users.get(username);
							ref = m.group(3);
							fOut = new File(dirOut + "/" + year + "-" + month + "-" + username + ".html");
							isNewFile = !fOut.exists();
							fos = new FileOutputStream(fOut, true);
							ows = new OutputStreamWriter(fos, "UTF-8");
							if(isNewFile) {
								ows.write(
"<!DOCTYPE html>\n" +
"<html>\n" +
"<head>\n" +
"<title>Relatório de aprovação de pedidos de certificados qualificados - " + name + " (" + MONTHS[Integer.parseInt(month) - 1] + " / " + year + ")</title>\n" +
"<style type=\"text/css\">\n" +
"body { font-family: sans-serif; font-size: 90%; }\n" +
"code { font-family: \"Courier New\", monospace; }\n" +
"table.reg, tr.reg, th.reg, td.reg { border: 1px solid; border-collapse: collapse; padding: 5px; padding-left: 20px; padding-right: 20px; }\n" +
"tr.reg:nth-child(even) { background-color: #f2f2f2; }\n" +
"table.reg tr { counter-increment: row-num; }\n" +
"table.reg tr.reg td.reg:first-child::before { content: counter(row-num); }\n" +
"</style>\n" +
"</head>\n" +
"<body>\n" +
"<img src=\"data:image/png;base64," + LOGO_B64 + "\"/>\n" +
"<h1>Relatório de aprovação de pedidos de certificados qualificados</h1>\n" +
"<p><b>Colaborador(a):</b> " + name + " (<i>username</i>: <code>" + username + "</code>)</p>\n" +
"<p><b>Período:</b> " + MONTHS[Integer.parseInt(month) - 1] + " / " + year + "</p>\n" +
"<p></p>\n" +
"<p>\n" +
"<table class=\"reg\">\n" +
"<thead class=\"reg\" style=\"background-color: DimGray;\"><th class=\"reg\"><span style=\"color: white;\">#</span></th><th class=\"reg\"><span style=\"color: white;\">Referência</span></th><th class=\"reg\"><span style=\"color: white;\">Data de Aprovação</span></th></thead>\n"
);
							}
							ows.write("<tr class=\"reg\"><td class=\"reg\" style=\"text-align: right;\"></td><td class=\"reg\"><code>" + ref + "</code></td><td class=\"reg\">" + year + "-" + month + "-" + day + " " + time + "</td></tr>\n");
							ows.close();
							fos.close();
						}
					}
		
					in.close();
					reader.close();
					gzis.close();
					fis.close();
				}
			}
		}
	}

	protected static Map<String, String>loadUsers() throws Exception {
		HashMap<String, String> users = new HashMap<String, String>();
		FileInputStream fis = new FileInputStream("data/users.txt");
		InputStreamReader reader = new InputStreamReader(fis);
		BufferedReader in = new BufferedReader(reader);
		String lineEntry;
		Pattern usersPattern = Pattern.compile("^(.+),\\s*(.*)");
		Matcher m;
		String username, name;

		while((lineEntry = in.readLine()) != null) {
			m = usersPattern.matcher(lineEntry);
			if(m.matches()) {
				username = m.group(1);
				name = m.group(2).trim();
				if(name.equals("")) {
					name = username;
				}
				users.put(username, name);
			}
		}

		in.close();
		reader.close();
		fis.close();

		return users;
	}

	private static void addTrail(String outDir, Map<String, String> users) throws Exception {
		File[] outFiles = (new File(outDir)).listFiles();
		File f;
		FileOutputStream fos;
		OutputStreamWriter ows;
		Pattern filePattern = Pattern.compile(".*\\d+\\-\\d+\\-(\\p{Print}+)\\.html");
		Matcher m;

		for(int i = 0; i < outFiles.length; i++) {
			f = outFiles[i];
			m = filePattern.matcher(f.getName());
			m.matches();
			fos = new FileOutputStream(f, true);
			ows = new OutputStreamWriter(fos, "UTF-8");
			ows.write(
"</table>\n" +
"</p>\n" +
"<br/><br/><br/><br/>\n"+
"<table style=\"border: 0px;\">\n" +
"<tr height=\"20px\"><td>_________________________________</td></tr>\n" +		
"<tr><td align=\"center\"><b>" + users.get(m.group(1)) + "</b></td></tr>\n" +
"<tr><td align=\"center\"><i>Operador(a) de Registo</i></td></tr>\n" +		
"</body>\n" +
"</html>"
);
			ows.close();
			fos.close();
		}
	}

	private static void clearOutputDirectory(String outDir) throws Exception {
		File[] outFiles = (new File(outDir)).listFiles();

		for(int i = 0; i < outFiles.length; i++) {
			outFiles[i].delete();
		}
	}

}
