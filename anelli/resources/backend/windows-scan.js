// Windows non ha du: PowerShell compila al volo questo enumeratore, molto più
// veloce di Get-ChildItem. Compatibile col C# 5 di Windows PowerShell 5.1.
export const WINDOWS_SCANNER = String.raw`
using System; using System.IO; using System.Text;
public static class AnelliScan {
  static StreamWriter o, e;
  static long Walk(DirectoryInfo d) {
    long total = 0;
    try {
      foreach (FileSystemInfo i in d.EnumerateFileSystemInfos()) {
        try {
          int a = (int)i.Attributes;
          bool reparse = (a & 0x400) != 0;
          bool dir = (a & 0x10) != 0;
          if (dir && !reparse) { total += Walk((DirectoryInfo)i); continue; }
          long size = 0;
          if (!dir && !reparse && (a & 0x401000) == 0) size = ((FileInfo)i).Length;
          total += size;
          o.Write(size); o.Write("\tF\t"); o.Write(i.FullName); o.Write('\n');
        } catch (Exception x) { e.WriteLine(x.Message); }
      }
    } catch (Exception x) { e.WriteLine(x.Message); }
    o.Write(total); o.Write("\tD\t"); o.Write(d.FullName); o.Write('\n');
    return total;
  }
  public static void Run(string root, string outFile, string errFile) {
    Encoding utf8 = new UTF8Encoding(false);
    using (o = new StreamWriter(new FileStream(outFile, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), utf8, 65536))
    using (e = new StreamWriter(new FileStream(errFile, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), utf8)) {
      Walk(new DirectoryInfo(root));
    }
  }
}`;
